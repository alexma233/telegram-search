import type { WsEventToClient, WsEventToClientData, WsEventToServer, WsEventToServerData, WsMessageToClient } from '@tg-search/server/types'

import type { ClientEventHandlerMap, ClientEventHandlerQueueMap } from '../event-handlers'
import type { SessionContext } from '../stores/useAuth'

import { useLogger } from '@unbird/logg'
import { useLocalStorage } from '@vueuse/core'
import { defu } from 'defu'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { v4 as uuidv4 } from 'uuid'
import { ref } from 'vue'

import { getRegisterEventHandler, registerAllEventHandlers } from '../event-handlers'

interface WorkerMessage {
  kind: 'rpc' | 'event' | 'rpc:result' | 'rpc:error'
  id?: string
  sessionId: string
  method?: string
  params?: unknown
  event?: string
  payload?: unknown
  ok?: boolean
  result?: unknown
  message?: string
}

export const useSharedWorkerStore = defineStore('shared-worker', () => {
  const storageSessions = useLocalStorage('shared-worker/sessions', new Map<string, SessionContext>())
  const storageActiveSessionId = useLocalStorage('shared-worker/active-session-id', uuidv4())

  const logger = useLogger('SharedWorkerAdapter')

  let worker: SharedWorker | null = null
  let port: MessagePort | null = null

  const eventHandlers: ClientEventHandlerMap = new Map()
  const eventHandlersQueue: ClientEventHandlerQueueMap = new Map()
  const rpcCallbacks = new Map<string, { resolve: (result: any) => void, reject: (error: Error) => void }>()

  const isInitialized = ref(false)
  const isConnected = ref(false)

  function deepClone<T>(data?: T): T | undefined {
    if (!data)
      return data

    try {
      return JSON.parse(JSON.stringify(data)) as T
    }
    catch (error) {
      logger.withError(error).error('Failed to deep clone data')
      return data
    }
  }

  const getActiveSession = () => {
    return storageSessions.value.get(storageActiveSessionId.value)
  }

  const updateActiveSession = (sessionId: string, partialSession: Partial<SessionContext>) => {
    const mergedSession = defu({}, partialSession, storageSessions.value.get(sessionId))

    storageSessions.value.set(sessionId, mergedSession)
    storageActiveSessionId.value = sessionId
  }

  const cleanup = () => {
    storageSessions.value.clear()
    storageActiveSessionId.value = uuidv4()
  }

  function sendRPC<T = any>(method: string, params?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!port) {
        reject(new Error('SharedWorker not connected'))
        return
      }

      const id = uuidv4()
      const message: WorkerMessage = {
        kind: 'rpc',
        id,
        sessionId: storageActiveSessionId.value,
        method,
        params,
      }

      rpcCallbacks.set(id, { resolve, reject })

      setTimeout(() => {
        if (rpcCallbacks.has(id)) {
          rpcCallbacks.delete(id)
          reject(new Error(`RPC timeout: ${method}`))
        }
      }, 30000)

      port.postMessage(message)
    })
  }

  function sendEventToWorker(event: string, payload?: unknown) {
    if (!port) {
      logger.error('SharedWorker not connected')
      return
    }

    const message: WorkerMessage = {
      kind: 'event',
      sessionId: storageActiveSessionId.value,
      event,
      payload,
    }

    port.postMessage(message)
  }

  function handleWorkerMessage(event: MessageEvent<WorkerMessage>) {
    const message = event.data

    if (!message || typeof message !== 'object') {
      logger.error('Invalid message from worker')
      return
    }

    switch (message.kind) {
      case 'rpc:result': {
        const { id, result } = message
        if (id && rpcCallbacks.has(id)) {
          const { resolve } = rpcCallbacks.get(id)!
          rpcCallbacks.delete(id)
          resolve(result)
        }
        break
      }

      case 'rpc:error': {
        const { id, message: errorMessage } = message
        if (id && rpcCallbacks.has(id)) {
          const { reject } = rpcCallbacks.get(id)!
          rpcCallbacks.delete(id)
          reject(new Error(errorMessage || 'RPC error'))
        }
        break
      }

      case 'event': {
        const { event, payload } = message
        if (event) {
          sendWsEvent({ type: event as keyof WsEventToClient, data: deepClone(payload) as any })
        }
        break
      }

      default:
        logger.withFields({ kind: message.kind }).warn('Unknown message kind from worker')
    }
  }

  function sendEvent<T extends keyof WsEventToServer>(event: T, data?: WsEventToServerData<T>) {
    logger.withFields({ event, data }).debug('Sending event to SharedWorker')
    sendEventToWorker(event, data)
  }

  function sendWsEvent(event: WsMessageToClient) {
    if (eventHandlers.has(event.type)) {
      const fn = eventHandlers.get(event.type)
      try {
        fn?.(deepClone(event.data) as WsEventToClientData<keyof WsEventToClient>)
      }
      catch (error) {
        logger.withError(error).error('Failed to handle event')
      }
    }

    if (eventHandlersQueue.has(event.type)) {
      const fnQueue = eventHandlersQueue.get(event.type) ?? []

      try {
        fnQueue.forEach((inQueueFn) => {
          inQueueFn(deepClone(event.data) as WsEventToClientData<keyof WsEventToClient>)
          fnQueue.pop()
        })
      }
      catch (error) {
        logger.withError(error).error('Failed to handle event')
      }
    }
  }

  const registerEventHandler = getRegisterEventHandler(eventHandlers, sendEvent)

  async function connectToWorker() {
    try {
      const workerUrl = new URL('/src/workers/core.shared-worker.ts', import.meta.url).href

      worker = new SharedWorker(
        workerUrl,
        { type: 'module', name: 'core-worker' },
      )

      port = worker.port

      port.addEventListener('message', handleWorkerMessage)
      port.start()

      logger.log('Connected to SharedWorker')

      await sendRPC('session:attach')
      isConnected.value = true

      logger.log('Session attached to SharedWorker')

      sendWsEvent({
        type: 'server:connected',
        data: { sessionId: storageActiveSessionId.value, connected: true },
      })
    }
    catch (error) {
      logger.withError(error).error('Failed to connect to SharedWorker')
      throw error
    }
  }

  async function init() {
    if (isInitialized.value) {
      logger.debug('SharedWorker adapter already initialized, skipping')
      return
    }

    try {
      registerAllEventHandlers(registerEventHandler)
      await connectToWorker()

      try {
        await sendRPC('session:getSnapshot')
      }
      catch (error) {
        logger.withError(error).warn('Failed to get snapshot, continuing anyway')
      }

      isInitialized.value = true
    }
    catch (error) {
      logger.withError(error).error('Failed to initialize SharedWorker adapter')
      throw error
    }
  }

  function waitForEvent<T extends keyof WsEventToClient>(event: T) {
    logger.withFields({ event }).debug('Waiting for event from SharedWorker')

    return new Promise<WsEventToClientData<T>>((resolve) => {
      const handlers = eventHandlersQueue.get(event) ?? []

      handlers.push((data) => {
        resolve(deepClone(data) as WsEventToClientData<T>)
      })

      eventHandlersQueue.set(event, handlers)
    })
  }

  async function getSnapshot() {
    try {
      const snapshot = await sendRPC('session:getSnapshot')
      logger.withFields({ snapshot }).debug('Received snapshot from worker')
      return snapshot
    }
    catch (error) {
      logger.withError(error).error('Failed to get snapshot')
      return {}
    }
  }

  return {
    init,

    sessions: storageSessions,
    activeSessionId: storageActiveSessionId,
    getActiveSession,
    updateActiveSession,
    cleanup,

    sendEvent,
    waitForEvent,
    getSnapshot,

    isConnected,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSharedWorkerStore, import.meta.hot))
}
