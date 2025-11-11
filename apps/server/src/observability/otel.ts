import type { NodeSDKConfiguration } from '@opentelemetry/sdk-node'

import { useLogger } from '@guiiai/logg'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus'
import { NodeSDK } from '@opentelemetry/sdk-node'

const logger = useLogger('observability:otel')

let sdk: NodeSDK | null = null

export interface OtelConfig {
  enabled: boolean
  serviceName: string
  prometheusPort?: number
}

/**
 * Initialize OpenTelemetry SDK with Prometheus exporter
 */
export function initOtel(config: OtelConfig): NodeSDK | null {
  if (!config.enabled) {
    logger.log('OpenTelemetry is disabled')
    return null
  }

  try {
    // Configure Prometheus exporter
    const prometheusExporter = new PrometheusExporter({
      port: config.prometheusPort || 9464,
      endpoint: '/metrics',
    })

    const sdkConfig: Partial<NodeSDKConfiguration> = {
      serviceName: config.serviceName,
      // Automatically instrument supported libraries
      instrumentations: [
        getNodeAutoInstrumentations({
          // Customize instrumentation if needed
          '@opentelemetry/instrumentation-fs': {
            enabled: false, // Can be noisy
          },
          '@opentelemetry/instrumentation-http': {
            enabled: true,
          },
          '@opentelemetry/instrumentation-express': {
            enabled: false, // We're using h3, not express
          },
        }),
      ],
      metricReader: prometheusExporter,
    }

    sdk = new NodeSDK(sdkConfig)
    sdk.start()

    logger.log(`OpenTelemetry initialized with service name: ${config.serviceName}`)
    logger.log(`Prometheus exporter listening on port ${config.prometheusPort || 9464}`)

    return sdk
  }
  catch (error) {
    logger.withError(error).error('Failed to initialize OpenTelemetry')
    return null
  }
}

/**
 * Shutdown OpenTelemetry SDK gracefully
 */
export async function shutdownOtel() {
  if (sdk) {
    try {
      await sdk.shutdown()
      logger.log('OpenTelemetry SDK shut down successfully')
    }
    catch (error) {
      logger.withError(error).error('Error shutting down OpenTelemetry SDK')
    }
  }
}
