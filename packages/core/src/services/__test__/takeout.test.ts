import type { CoreContext, CoreEmitter } from '../../context'
import type { CoreDB } from '../../db'
import type { AccountSettings } from '../../types/account-settings'
import type { CoreUserEntity } from '../../types/events'

import bigInt from 'big-integer'

import { useLogger } from '@guiiai/logg'
import { Api } from 'telegram'
import { describe, expect, it, vi } from 'vitest'

import { createTask as createCoreTask } from '../../utils/task'
import { createTakeoutService } from '../takeout'

const mockWaiter = vi.fn(async (_signal?: AbortSignal) => {})
const logger = useLogger()

vi.mock('../../utils/min-interval', () => {
  return {
    createMinIntervalWaiter: () => mockWaiter,
  }
})

function createMockDb(row?: { chatType?: string, accessHash?: string }) {
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => (row ? [row] : [])),
      })),
    })),
  }))

  const updateWhere = vi.fn(async () => {})
  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: updateWhere,
    })),
  }))

  return { select, update }
}

function createMockCtx(client: any, dbRow?: { chatType?: string, accessHash?: string }) {
  const withError = vi.fn((error: unknown) => (error instanceof Error ? error : new Error(String(error))))
  const db = createMockDb(dbRow)

  const ctx: CoreContext = {
    emitter: {} as unknown as CoreEmitter,
    toCoreEvents: new Set(),
    fromCoreEvents: new Set(),
    wrapEmitterEmit: () => {},
    wrapEmitterOn: () => {},
    setClient: () => {},
    getClient: () => client,
    setCurrentAccountId: () => {},
    getCurrentAccountId: () => 'acc-1',
    getDB: () => db as unknown as CoreDB,
    withError,
    cleanup: () => {},
    setMyUser: () => {},
    getMyUser: () => ({}) as unknown as CoreUserEntity,
    getAccountSettings: async () => ({}) as unknown as AccountSettings,
    setAccountSettings: async () => {},
    metrics: undefined,
  }

  return { ctx, withError, db }
}

function createTask() {
  // Minimal emitter stub for CoreTask -> task.ts only calls emitter.emit(...)
  const emitter = { emit: vi.fn() } as unknown as CoreEmitter
  return createCoreTask('takeout', { chatIds: ['123'] }, emitter, logger)
}

describe('takeout service', () => {
  it('getTotalMessageCount should return count from telegram history', async () => {
    const client = {
      getInputEntity: vi.fn(async (chatId: string) => chatId),
      invoke: vi.fn(async (query: any) => {
        if (query instanceof Api.messages.GetHistory) {
          return {
            count: 123,
            messages: [],
          }
        }
        throw new Error('unexpected query')
      }),
    }

    const { ctx } = createMockCtx(client)

    const service = createTakeoutService(ctx, logger)
    const count = await service.getTotalMessageCount('123')

    expect(count).toBe(123)
  })

  it('getTotalMessageCount should return 0 on failure', async () => {
    const client = {
      getInputEntity: vi.fn(async (chatId: string) => chatId),
      invoke: vi.fn(async () => {
        throw new Error('fail')
      }),
    }

    const { ctx } = createMockCtx(client)

    const service = createTakeoutService(ctx, logger)
    const count = await service.getTotalMessageCount('123')

    expect(count).toBe(0)
  })

  it('takeoutMessages should yield messages, skip MessageEmpty, and finish successfully', async () => {
    const calls: any[] = []

    const client = {
      getInputEntity: vi.fn(async (_chatId: string) => ({})),
      invoke: vi.fn(async (query: any) => {
        calls.push(query)

        if (query instanceof Api.account.InitTakeoutSession) {
          return { id: bigInt(1) }
        }

        if (query instanceof Api.InvokeWithTakeout) {
          const inner = (query).query
          if (inner instanceof Api.messages.GetHistory) {
            // First page has 3 results (one empty), second is boundary.
            if ((inner).offsetId === 0) {
              return {
                messages: [
                  new Api.MessageEmpty({ id: 1 }),
                  { id: 2 },
                  { id: 3 },
                ],
              }
            }
            return { messages: [] }
          }

          if (inner instanceof Api.account.FinishTakeoutSession) {
            return {}
          }
        }

        throw new Error('unexpected query')
      }),
    }

    const { ctx } = createMockCtx(client)

    const service = createTakeoutService(ctx, logger)
    const task = createTask()
    task.updateProgress = vi.fn()
    task.updateError = vi.fn()

    const yielded: any[] = []
    for await (const m of service.takeoutMessages('123', {
      pagination: { limit: 100, offset: 0 },
      minId: 0,
      maxId: 0,
      skipMedia: true,
      task,
      expectedCount: 3,
      disableAutoProgress: false,
      syncOptions: undefined,
    })) {
      yielded.push(m)
    }

    expect(yielded.map(m => m.id)).toEqual([2, 3])

    // Init + get messages + final complete
    expect(task.updateProgress).toHaveBeenCalledWith(0, 'Init takeout session')
    expect(task.updateProgress).toHaveBeenCalledWith(0, 'Get messages')
    expect(task.updateProgress).toHaveBeenCalledWith(100)

    // Ensure we finished session successfully.
    const finished = calls.find(q => q instanceof Api.InvokeWithTakeout && (q).query instanceof Api.account.FinishTakeoutSession)
    expect(finished).toBeTruthy()
    expect((finished).query.success).toBe(true)
  })

  it('takeoutMessages should updateError and stop when initTakeout fails', async () => {
    const client = {
      getInputEntity: vi.fn(async () => ({})),
      invoke: vi.fn(async (query: any) => {
        if (query instanceof Api.account.InitTakeoutSession) {
          throw new TypeError('init failed')
        }
        throw new Error('unexpected query')
      }),
    }

    const { ctx } = createMockCtx(client)

    const service = createTakeoutService(ctx, logger)
    const task = createTask()
    task.updateError = vi.fn()

    const yielded: any[] = []
    for await (const m of service.takeoutMessages('123', {
      pagination: { limit: 100, offset: 0 },
      minId: 0,
      maxId: 0,
      skipMedia: true,
      task,
      expectedCount: 1,
      disableAutoProgress: false,
      syncOptions: undefined,
    })) {
      yielded.push(m)
    }

    expect(yielded).toEqual([])
    expect(task.updateError).toHaveBeenCalledTimes(1)
  })

  it('takeoutMessages should stop when aborted during rate-limit wait', async () => {
    const waiter = vi.fn(async (signal?: AbortSignal) => {
      if (signal?.aborted) {
        throw new Error('aborted')
      }
    })

    mockWaiter.mockImplementation(waiter)

    const calls: any[] = []

    const client = {
      getInputEntity: vi.fn(async (_chatId: string) => ({})),
      invoke: vi.fn(async (query: any) => {
        calls.push(query)

        if (query instanceof Api.account.InitTakeoutSession) {
          return { id: bigInt(1) }
        }

        if (query instanceof Api.InvokeWithTakeout) {
          const inner = (query).query
          if (inner instanceof Api.messages.GetHistory) {
            return {
              messages: [{ id: 1 }],
            }
          }
          if (inner instanceof Api.account.FinishTakeoutSession) {
            return {}
          }
        }

        throw new Error('unexpected query')
      }),
    }

    const { ctx } = createMockCtx(client)

    const service = createTakeoutService(ctx, logger)
    const task = createTask()

    // Abort before iteration begins so waitHistoryInterval throws.
    task.state.abortController.abort()

    const yielded: any[] = []
    for await (const m of service.takeoutMessages('123', {
      pagination: { limit: 100, offset: 0 },
      minId: 0,
      maxId: 0,
      skipMedia: true,
      task,
      expectedCount: 10,
      disableAutoProgress: false,
      syncOptions: undefined,
    })) {
      yielded.push(m)
    }

    expect(yielded).toEqual([])

    // Should still finish takeout session successfully after breaking.
    const finished = calls.find(q => q instanceof Api.InvokeWithTakeout && (q).query instanceof Api.account.FinishTakeoutSession)
    expect(finished).toBeTruthy()
    expect((finished).query.success).toBe(true)
  })

  it('takeoutMessages retries once with refreshed peer on CHANNEL_INVALID', async () => {
    let firstHistory = true

    const client = {
      getInputEntity: vi.fn(async () => new Api.InputPeerChannel({
        channelId: bigInt(123),
        accessHash: bigInt(1),
      })),
      getEntity: vi.fn(async () => new Api.Channel({
        id: bigInt(123),
        accessHash: bigInt(999),
        title: 'channel',
      })),
      invoke: vi.fn(async (query: any) => {
        if (query instanceof Api.account.InitTakeoutSession) {
          return { id: bigInt(1) }
        }

        if (query instanceof Api.InvokeWithTakeout) {
          const inner = (query).query
          if (inner instanceof Api.messages.GetHistory) {
            if (firstHistory) {
              firstHistory = false
              throw new Error('CHANNEL_INVALID')
            }
            return { messages: [] }
          }
          if (inner instanceof Api.account.FinishTakeoutSession) {
            return {}
          }
        }

        throw new Error('unexpected query')
      }),
    }

    const { ctx, db } = createMockCtx(client, { chatType: 'channel', accessHash: '1' })

    const service = createTakeoutService(ctx, logger)
    const task = createTask()

    const yielded: any[] = []
    for await (const m of service.takeoutMessages('123', {
      pagination: { limit: 10, offset: 0 },
      minId: 0,
      maxId: 0,
      skipMedia: true,
      task,
      expectedCount: 1,
      disableAutoProgress: false,
      syncOptions: undefined,
    })) {
      yielded.push(m)
    }

    expect(yielded).toEqual([])
    expect(client.getEntity).toHaveBeenCalledTimes(1)
    expect(db.update).toHaveBeenCalled()
  })
})
