import type { Config, ProxyConfig } from './config-schema'
import type { RuntimeFlags } from './flags'

import { useLogger } from '@unbird/logg'
import defu from 'defu'
import { safeParse } from 'valibot'

import { getDatabaseDSN } from './config'
import { configSchema, generateDefaultConfig } from './config-schema'
import { parseProxyUrl } from './proxy-url-parser'

export function validateAndMergeConfig(newConfig: Partial<Config>, baseConfig?: Config): Config {
  const mergedConfig = defu({}, newConfig, baseConfig || generateDefaultConfig())
  const validatedConfig = safeParse(configSchema, mergedConfig)

  if (!validatedConfig.success) {
    useLogger().withFields({ issues: validatedConfig.issues }).error('Failed to validate config')
    throw new Error('Failed to validate config')
  }

  return validatedConfig.output
}

export function applyTelegramOverrides(config: Config, flags?: RuntimeFlags): void {
  if (flags?.telegramApiId || flags?.telegramApiHash) {
    config.api = config.api || {}
    const currentTelegram = config.api.telegram || {}
    config.api.telegram = {
      ...currentTelegram,
      ...(flags.telegramApiId && { apiId: flags.telegramApiId }),
      ...(flags.telegramApiHash && { apiHash: flags.telegramApiHash }),
    }
  }
}

export function applyEmbeddingOverrides(config: Config, flags?: RuntimeFlags): void {
  if (
    flags?.embeddingProvider
    || flags?.embeddingModel
    || flags?.embeddingDimension
    || flags?.embeddingApiKey
    || flags?.embeddingApiBase
  ) {
    config.api = config.api || {}
    const currentEmbedding = config.api.embedding || {}
    config.api.embedding = {
      ...currentEmbedding,
      ...(flags.embeddingProvider && { provider: flags.embeddingProvider }),
      ...(flags.embeddingModel && { model: flags.embeddingModel }),
      ...(flags.embeddingDimension && { dimension: flags.embeddingDimension }),
      ...(flags.embeddingApiKey && { apiKey: flags.embeddingApiKey }),
      ...(flags.embeddingApiBase && { apiBase: flags.embeddingApiBase }),
    }
  }
}

export function applyProxyOverrides(config: Config, flags?: RuntimeFlags): void {
  config.api = config.api || {}
  const currentTelegram = config.api.telegram || {}
  let proxyConfig = currentTelegram.proxy

  // First, try to parse proxyUrl from flags (environment variable)
  if (flags?.proxyUrl) {
    const parsedFromUrl = parseProxyUrl(flags.proxyUrl)
    if (parsedFromUrl) {
      proxyConfig = parsedFromUrl
    }
  }
  // Then, try to parse proxyUrl from config file
  else if (currentTelegram.proxy?.proxyUrl) {
    const parsedFromUrl = parseProxyUrl(currentTelegram.proxy.proxyUrl)
    if (parsedFromUrl) {
      proxyConfig = parsedFromUrl
    }
  }
  // Finally, apply individual proxy flags (legacy support)
  else {
    const proxyFlags = {
      ip: flags?.proxyIp,
      port: flags?.proxyPort,
      MTProxy: flags?.proxyMTProxy,
      secret: flags?.proxySecret,
      socksType: flags?.proxySocksType,
      timeout: flags?.proxyTimeout,
      username: flags?.proxyUsername,
      password: flags?.proxyPassword,
    }

    const definedProxyFlags = Object.fromEntries(
      Object.entries(proxyFlags).filter(([, value]) => value !== undefined),
    )

    if (Object.keys(definedProxyFlags).length > 0) {
      proxyConfig = defu(definedProxyFlags, currentTelegram.proxy) as ProxyConfig
    }
  }

  // Both ip and port must be valid for the proxy to work
  if (proxyConfig && proxyConfig.ip && proxyConfig.port) {
    config.api.telegram = {
      ...currentTelegram,
      proxy: proxyConfig,
    }
  }
}

export function applyRuntimeOverrides(baseConfig: Config, flags?: RuntimeFlags): Config {
  const runtimeConfig: Config = {
    ...baseConfig,
    database: { ...baseConfig.database },
  }

  if (baseConfig.api) {
    runtimeConfig.api = { ...baseConfig.api }
  }

  // Apply database URL override
  runtimeConfig.database.type = flags?.dbProvider || runtimeConfig.database.type
  runtimeConfig.database.url = flags?.dbUrl || runtimeConfig.database.url || getDatabaseDSN(runtimeConfig)

  // Apply API overrides
  applyTelegramOverrides(runtimeConfig, flags)
  applyEmbeddingOverrides(runtimeConfig, flags)
  applyProxyOverrides(runtimeConfig, flags)

  return runtimeConfig
}
