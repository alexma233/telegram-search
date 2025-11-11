import type { RuntimeFlags } from '@tg-search/common'
import type { CrossWSOptions } from 'listhen'

import process from 'node:process'

import { initLogger, useLogger } from '@guiiai/logg'
import { initConfig, parseEnvFlags } from '@tg-search/common'
import { initDrizzle } from '@tg-search/core'
import { createApp, createRouter, defineEventHandler, toNodeListener } from 'h3'
import { listen } from 'listhen'

import { getMetrics, httpRequestDuration, httpRequests, initMetrics } from './observability/metrics'
import { initOtel, shutdownOtel } from './observability/otel'
import { setupWsRoutes } from './ws/routes'

function setupErrorHandlers(logger: ReturnType<typeof useLogger>): void {
  // TODO: fix type
  const handleError = (error: any, type: string) => {
    logger.withFields({ cause: String(error?.cause), cause_json: JSON.stringify(error?.cause) }).withError(error).error(type)
  }

  process.on('uncaughtException', error => handleError(error, 'Uncaught exception'))
  process.on('unhandledRejection', error => handleError(error, 'Unhandled rejection'))
}

function configureServer(logger: ReturnType<typeof useLogger>, flags: RuntimeFlags) {
  const app = createApp({
    debug: flags.isDebugMode,
    onRequest(event) {
      const path = event.path
      const method = event.method as string

      // Store request start time for duration tracking
      (event.node.req as any)._startTime = Date.now()

      logger.withFields({
        method,
        path,
      }).log('Request started')
    },
    onBeforeResponse(event) {
      const path = event.path
      const method = event.method as string
      const startTime = (event.node.req as any)._startTime

      if (startTime) {
        const duration = (Date.now() - startTime) / 1000 // Convert to seconds
        httpRequestDuration.observe({ method, path }, duration)

        // Get status from response
        const status = event.node.res.statusCode || 200
        httpRequests.inc({ method, path, status: String(status) })
      }
    },
    onError(error, event) {
      const path = event.path
      const method = event.method as string

      const status = error instanceof Error && 'statusCode' in error
        ? (error as { statusCode: number }).statusCode
        : 500

      // Track error metrics
      const startTime = (event.node.req as any)._startTime
      if (startTime) {
        const duration = (Date.now() - startTime) / 1000
        httpRequestDuration.observe({ method, path }, duration)
        httpRequests.inc({ method, path, status: String(status) })
      }

      logger.withFields({
        method,
        path,
        status,
        error: error instanceof Error ? error.message : 'Unknown error',
      }).error('Request failed')

      return Response.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    },
  })

  const router = createRouter()
  router.get('/health', defineEventHandler(() => {
    return Response.json({ success: true })
  }))

  router.get('/metrics', defineEventHandler(async () => {
    const metrics = await getMetrics()
    return new Response(metrics, {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      },
    })
  }))

  app.use(router)
  setupWsRoutes(app)

  return app
}

async function bootstrap() {
  const flags = parseEnvFlags(process.env as Record<string, string>)
  initLogger(flags.logLevel, flags.logFormat)
  const logger = useLogger().useGlobalConfig()
  const config = await initConfig(flags)

  try {
    await initDrizzle(logger, config, { isDatabaseDebugMode: flags.isDatabaseDebugMode })
    logger.log('Database initialized successfully')
  }
  catch (error) {
    logger.withError(error).error('Failed to initialize services')
    process.exit(1)
  }

  setupErrorHandlers(logger)

  // Initialize observability
  initMetrics()
  logger.log('Prometheus metrics initialized')

  // Initialize OpenTelemetry (optional, can be controlled via env)
  const otelEnabled = process.env.OTEL_ENABLED === 'true'
  if (otelEnabled) {
    initOtel({
      enabled: true,
      serviceName: process.env.OTEL_SERVICE_NAME || 'telegram-search-server',
      prometheusPort: process.env.OTEL_PROMETHEUS_PORT ? Number(process.env.OTEL_PROMETHEUS_PORT) : 9464,
    })
  }

  const app = configureServer(logger, flags)
  const listener = toNodeListener(app)

  const port = process.env.PORT ? Number(process.env.PORT) : 3000
  const server = await listen(listener, { port, ws: app.websocket as CrossWSOptions })

  logger.log('Server started')

  const shutdown = async () => {
    logger.log('Shutting down server gracefully...')

    // Shutdown OpenTelemetry if it was initialized
    if (otelEnabled) {
      await shutdownOtel()
    }

    server.close()
    process.exit(0)
  }
  process.prependListener('SIGINT', shutdown)
  process.prependListener('SIGTERM', shutdown)

  return app
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
