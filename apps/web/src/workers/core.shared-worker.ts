import type { CoreContext, CoreEventData, FromCoreEvent, ToCoreEvent } from '@tg-search/core'

import { initLogger, LoggerLevel, useLogger } from '@unbird/logg'

// Polyfill window for isBrowser() check
// This makes the code think we're in a browser environment
if (typeof window === 'undefined') {
  // @ts-expect-error - polyfill window
  globalThis.window = globalThis
}

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
// Track per-session forwarding listeners we add to avoid nuking core handlers
const sessionForwarders = new Map<string, Map<string, (data: unknown) => void>>()

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

  try {
    const isDebug = true
    initLogger(isDebug ? LoggerLevel.Debug : LoggerLevel.Verbose)
    logger.log('Logger initialized')

    // Initialize config using initConfig, which needs localStorage
    // Worker has localStorage in globalThis, so this should work
    const { initConfig } = await import('@tg-search/common')
    logger.log('@tg-search/common imported')

    await initConfig()
    logger.log('Config initialized successfully')

    coreInstanceInitialized = true
    logger.log('Core instance initialized in SharedWorker')
  }
  catch (error) {
    logger.withError(error).error('Failed to initialize core')
    throw error
  }
}

async function getOrCreateSessionContext(sessionId: string): Promise<CoreContext> {
  try {
    await ensureCoreInitialized()

    if (!sessionContexts.has(sessionId)) {
      logger.withFields({ sessionId }).log('Creating new session context...')

      const { useConfig } = await import('@tg-search/common')
      const config = useConfig()
      logger.log('Got config from useConfig')

      const { createCoreInstance, initDrizzle, basicEventHandler, afterConnectedEventHandler, useEventHandler } = await import('@tg-search/core')
      logger.log('@tg-search/core imported')

      const ctx = createCoreInstance(config)
      logger.log('Core instance created')

      await initDrizzle(logger, config, {
        isDatabaseDebugMode: false,
      })
      logger.log('Database initialized')

      // Register event handlers - CRITICAL for Telegram to work!
      logger.log('🔧 Starting to register event handlers...')
      const eventHandler = useEventHandler(ctx, config)
      await eventHandler.register(basicEventHandler)
      logger.log('✅ Basic event handlers registered (includes auth:login)')
      eventHandler.register(afterConnectedEventHandler)
      logger.log('✅ After-connected event handlers registered')

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

        // Prepare or reuse per-session forwarder map
        const forwarders = sessionForwarders.get(sessionId) || new Map<string, (data: unknown) => void>()
        sessionForwarders.set(sessionId, forwarders)

        const eventNames = ctx.emitter.eventNames() as Array<keyof FromCoreEvent>
        eventNames.forEach((eventName) => {
          const eventNameStr = String(eventName)
          if (!eventNameStr.startsWith('server:')) {
            // If we previously added a forwarder for this event, remove it to avoid duplicates
            const prev = forwarders.get(eventNameStr)
            if (prev)
              ctx.emitter.off(eventName as any, prev as any)

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
            forwarders.set(eventNameStr, fn as any)
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
      logger.withFields({ event, payload }).log(`Emitting event to core: ${event}`)

      // Check if there are any listeners for this event
      const listenerCount = ctx.emitter.listenerCount(event as keyof ToCoreEvent)
      logger.log(`Event ${event} has ${listenerCount} listeners`)

      if (listenerCount === 0) {
        logger.error(`WARNING: No listeners for event ${event}! Event will be lost!`)
      }

      ctx.emitter.emit(event as keyof ToCoreEvent, deepClone(payload) as CoreEventData<keyof ToCoreEvent>)
      logger.withFields({ event }).log(`Event emitted to core: ${event}`)
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

// Global error handler
globalThis.addEventListener('error', (event) => {
  logger.withError(event.error).error('Unhandled error in SharedWorker')
})

globalThis.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection in SharedWorker:', event.reason)
})

globalThis.addEventListener('connect', (event) => {
  const connectEvent = event as MessageEvent
  const port = connectEvent.ports[0]

  logger.log('New connection to SharedWorker, port:', port)

  port.addEventListener('message', (msgEvent) => {
    logger.debug('Received message from client:', msgEvent.data)
    handleMessage(port, msgEvent)
  })

  port.start()
  logger.log('Port started')

  if (!isInitialized) {
    isInitialized = true
    logger.log('SharedWorker initialized')
  }
})

logger.log('SharedWorker script loaded and ready')
