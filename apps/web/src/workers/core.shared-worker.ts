import type { Config } from '@tg-search/common'
import type { CoreContext, CoreEventData, FromCoreEvent, ToCoreEvent } from '@tg-search/core'

import { createCoreInstance, initDrizzle } from '@tg-search/core'
import { initLogger, LoggerLevel, useLogger } from '@unbird/logg'

type WsEventToClientData<T extends keyof FromCoreEvent> = Parameters<FromCoreEvent[T]>[0]

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

const logger = useLogger('CoreSharedWorker')

const sessionContexts = new Map<string, CoreContext>()
const sessionPorts = new Map<string, MessagePort>()

let isInitialized = false
let coreInstanceInitialized = false

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

async function ensureCoreInitialized() {
  if (coreInstanceInitialized)
    return

  const isDebug = true
  initLogger(isDebug ? LoggerLevel.Debug : LoggerLevel.Verbose)

  coreInstanceInitialized = true
  logger.log('Core instance initialized in SharedWorker')
}

function getConfigFromStorage(): Config {
  try {
    const configStr = globalThis.localStorage?.getItem('settings/config')
    if (!configStr) {
      logger.error('Config not found in localStorage, using default config')
      // Import generateDefaultConfig from common (already imported as type)
      // For now, create a minimal default config
      return {
        api: {
          telegram: {
            apiId: 0,
            apiHash: '',
            autoReconnect: false,
          },
          proxy: {
            enabled: false,
          },
        },
        database: {
          type: 'pglite',
          url: '',
          host: 'localhost',
          port: 5432,
          database: 'telegram',
          username: 'postgres',
          password: '',
        },
        resolvers: {
          disabledResolvers: [],
        },
        embedding: {
          provider: 'openai',
          apiKey: '',
          baseUrl: '',
          model: '',
          dimension: 1536,
        },
      } as Config
    }

    const config = JSON.parse(configStr) as Config
    logger.log('Config loaded successfully from localStorage')
    return config
  }
  catch (error) {
    logger.withError(error).error('Failed to parse config from localStorage')
    throw new Error('Failed to parse config from localStorage')
  }
}

async function getOrCreateSessionContext(sessionId: string): Promise<CoreContext> {
  try {
    await ensureCoreInitialized()

    if (!sessionContexts.has(sessionId)) {
      logger.withFields({ sessionId }).log('Creating new session context...')

      const config = getConfigFromStorage()
      logger.log('Config loaded from localStorage')

      const ctx = createCoreInstance(config)
      logger.log('Core instance created')

      await initDrizzle(logger, config, {
        isDatabaseDebugMode: false,
      })
      logger.log('Database initialized')

      sessionContexts.set(sessionId, ctx)
      logger.withFields({ sessionId }).log('Session context created successfully')
    }

    return sessionContexts.get(sessionId)!
  }
  catch (error) {
    logger.withError(error).error('Failed to create session context')
    throw error
  }
}

function sendToPort(port: MessagePort, message: WorkerMessage) {
  try {
    port.postMessage(message)
  }
  catch (error) {
    logger.withError(error).error('Failed to send message to port')
  }
}

function handleRPC(port: MessagePort, message: WorkerMessage) {
  const { id, sessionId, method } = message

  if (!id || !sessionId || !method) {
    sendToPort(port, {
      kind: 'rpc:error',
      id: id || 'unknown',
      sessionId,
      message: 'Invalid RPC message',
    })
    return
  }

  logger.withFields({ method, sessionId }).debug('Handling RPC')

  switch (method) {
    case 'session:attach': {
      logger.withFields({ sessionId }).log('Starting session attach...')

      getOrCreateSessionContext(sessionId).then((ctx) => {
        logger.log('Session context obtained, setting up port...')
        sessionPorts.set(sessionId, port)

        const allEventNames = ctx.emitter.eventNames()
        allEventNames.forEach((eventName) => {
          ctx.emitter.removeAllListeners(eventName as keyof FromCoreEvent)
        })

        const eventNames = ctx.emitter.eventNames() as Array<keyof FromCoreEvent>
        eventNames.forEach((eventName) => {
          const eventNameStr = String(eventName)
          if (!eventNameStr.startsWith('server:')) {
            const fn = (data: WsEventToClientData<keyof FromCoreEvent>) => {
              logger.withFields({ eventName: eventNameStr, sessionId }).debug('Emitting event to client')
              sendToPort(port, {
                kind: 'event',
                sessionId,
                event: eventNameStr,
                payload: deepClone(data),
              })
            }

            ctx.emitter.on(eventName, fn as any)
          }
        })

        logger.log('Session attach complete, sending success response')
        sendToPort(port, {
          kind: 'rpc:result',
          id,
          sessionId,
          ok: true,
          result: { connected: true },
        })
      }).catch((error) => {
        logger.withError(error).error('Failed to attach session')
        sendToPort(port, {
          kind: 'rpc:error',
          id,
          sessionId,
          message: error instanceof Error ? error.message : 'Failed to attach session',
        })
      })
      break
    }

    case 'session:getSnapshot': {
      sendToPort(port, {
        kind: 'rpc:result',
        id,
        sessionId,
        ok: true,
        result: {},
      })
      break
    }

    default: {
      sendToPort(port, {
        kind: 'rpc:error',
        id,
        sessionId,
        message: `Unknown RPC method: ${method}`,
      })
    }
  }
}

async function handleEvent(message: WorkerMessage) {
  const { sessionId, event, payload } = message

  if (!sessionId || !event) {
    logger.error('Invalid event message')
    return
  }

  logger.withFields({ event, sessionId }).debug('Handling event')

  try {
    const ctx = await getOrCreateSessionContext(sessionId)
    const port = sessionPorts.get(sessionId)

    if (event === 'server:event:register') {
      const eventName = (payload as any)?.event as keyof FromCoreEvent

      if (!eventName.startsWith('server:') && port) {
        ctx.emitter.removeAllListeners(eventName)

        const fn = (data: WsEventToClientData<keyof FromCoreEvent>) => {
          logger.withFields({ eventName, sessionId }).debug('Emitting registered event to client')
          sendToPort(port, {
            kind: 'event',
            sessionId,
            event: eventName,
            payload: deepClone(data),
          })
        }

        ctx.emitter.on(eventName, fn as any)
      }
    }
    else {
      ctx.emitter.emit(event as keyof ToCoreEvent, deepClone(payload) as CoreEventData<keyof ToCoreEvent>)
    }
  }
  catch (error) {
    logger.withError(error).error('Failed to handle event')
  }
}

function handleMessage(port: MessagePort, event: MessageEvent<WorkerMessage>) {
  const message = event.data

  if (!message || typeof message !== 'object') {
    logger.error('Invalid message received')
    return
  }

  switch (message.kind) {
    case 'rpc':
      handleRPC(port, message)
      break

    case 'event':
      handleEvent(message)
      break

    default:
      logger.withFields({ kind: message.kind }).warn('Unknown message kind')
  }
}

globalThis.addEventListener('connect', (event) => {
  const connectEvent = event as MessageEvent
  const port = connectEvent.ports[0]

  logger.log('New connection to SharedWorker')

  port.addEventListener('message', (msgEvent) => {
    handleMessage(port, msgEvent)
  })

  port.start()

  if (!isInitialized) {
    isInitialized = true
    logger.log('SharedWorker initialized')
  }
})

logger.log('SharedWorker script loaded')
