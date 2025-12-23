import type { CoreContext } from '../../context'

import bigInt from 'big-integer'

import { Api } from 'telegram'
import { describe, expect, it, vi } from 'vitest'

import { resolvePeerByChatId } from '../peer'

function createDb(selectRow?: { chatType?: string, accessHash?: string }) {
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => (selectRow ? [selectRow] : [])),
      })),
    })),
  }))

  const updateWhere = vi.fn(async () => {})
  const update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: updateWhere,
    })),
  }))

  return { select, update, updateWhere }
}

function createCtx(overrides: Partial<CoreContext> & { selectRow?: any } = {}) {
  const db = overrides.getDB?.() ?? createDb(overrides.selectRow)
  const ctx: CoreContext = {
    emitter: undefined as any,
    toCoreEvents: new Set(),
    fromCoreEvents: new Set(),
    wrapEmitterEmit: () => {},
    wrapEmitterOn: () => {},
    setClient: () => {},
    getClient: () => overrides.getClient?.() as any,
    setCurrentAccountId: () => {},
    getCurrentAccountId: () => '',
    getDB: () => db as any,
    withError: overrides.withError as any,
    cleanup: () => {},
    setMyUser: () => {},
    getMyUser: () => undefined as any,
    getAccountSettings: async () => undefined as any,
    setAccountSettings: async () => {},
    metrics: undefined,
  }

  return { ctx, db: db as ReturnType<typeof createDb> }
}

describe('resolvePeerByChatId', () => {
  it('returns InputPeerUser from DB access hash without hitting network', async () => {
    const client = { getInputEntity: vi.fn(), getEntity: vi.fn() }
    const { ctx } = createCtx({
      selectRow: { chatType: 'user', accessHash: '123' },
      getClient: () => client as any,
    })

    const peer = await resolvePeerByChatId(ctx, '42')
    expect(peer).toBeInstanceOf(Api.InputPeerUser)
    expect((peer as Api.InputPeerUser).accessHash.toString()).toBe('123')
    expect(client.getInputEntity).not.toHaveBeenCalled()
    expect(client.getEntity).not.toHaveBeenCalled()
  })

  it('returns InputPeerChat for group without access hash', async () => {
    const client = { getInputEntity: vi.fn(), getEntity: vi.fn() }
    const { ctx } = createCtx({
      selectRow: { chatType: 'group', accessHash: '' },
      getClient: () => client as any,
    })

    const peer = await resolvePeerByChatId(ctx, '99')
    expect(peer).toBeInstanceOf(Api.InputPeerChat)
    expect(client.getInputEntity).not.toHaveBeenCalled()
    expect(client.getEntity).not.toHaveBeenCalled()
  })

  it('refresh=true fetches entity, backfills access hash, and returns new peer', async () => {
    const channel = new Api.Channel({
      id: bigInt(777),
      accessHash: bigInt(456),
      title: 'ch',
      date: 0,
      photo: new Api.ChatPhoto({ photoId: bigInt(0), dcId: 0 }),
    })
    const client = {
      getInputEntity: vi.fn(),
      getEntity: vi.fn(async () => channel),
    }
    const { ctx, db } = createCtx({
      selectRow: { chatType: 'channel', accessHash: '111' },
      getClient: () => client as any,
    })

    const peer = await resolvePeerByChatId(ctx, '777', { refresh: true })
    expect(peer).toBeInstanceOf(Api.InputPeerChannel)
    expect((peer as Api.InputPeerChannel).accessHash.toString()).toBe('456')
    expect(client.getEntity).toHaveBeenCalledTimes(1)
    expect(db.update).toHaveBeenCalled()
    expect(db.updateWhere).toHaveBeenCalled()
  })

  it('backfills access hash when db has row but hash is empty', async () => {
    const inputPeer = new Api.InputPeerChannel({
      channelId: bigInt(321),
      accessHash: bigInt(654),
    })
    const client = {
      getInputEntity: vi.fn(async () => inputPeer),
      getEntity: vi.fn(),
    }
    const { ctx, db } = createCtx({
      selectRow: { chatType: 'channel', accessHash: '' },
      getClient: () => client as any,
    })

    const peer = await resolvePeerByChatId(ctx, '321')
    expect(peer).toBe(inputPeer)
    expect(db.update).toHaveBeenCalled()
    expect(db.updateWhere).toHaveBeenCalled()
  })
})
