import type { Config } from './config-schema'
import type { RuntimeFlags } from './flags'

import { useLogger } from '@unbird/logg'
import { isBrowser } from '@unbird/logg/utils'

import { applyRuntimeOverrides, validateAndMergeConfig } from './config-overrides'
import { generateDefaultConfig } from './config-schema'

let config: Config
const CONFIG_STORAGE_KEY = 'settings/config'

export function getDatabaseDSN(config: Config): string {
  const { database } = config
  return database.url || `postgres://${database.user}:${database.password}@${database.host}:${database.port}/${database.database}`
}

export async function initConfig(flags?: RuntimeFlags) {
  if (isBrowser()) {
    const { useLocalStorage } = await import('@vueuse/core')
    const configStorage = useLocalStorage(CONFIG_STORAGE_KEY, generateDefaultConfig())

    const savedConfig = configStorage.value
    if (savedConfig) {
      try {
        config = validateAndMergeConfig(savedConfig)
        return config
      }
      catch {}
    }

    config = generateDefaultConfig()
    return config
  }

  const { useConfigPath } = await import('./node/path')
  const { readFileSync } = await import('node:fs')
  const { parse } = await import('yaml')

  const configPath = await useConfigPath()

  const configData = readFileSync(configPath, 'utf-8')
  const configParsedData = parse(configData)

  const validatedConfig = validateAndMergeConfig(configParsedData)
  const runtimeConfig = applyRuntimeOverrides(validatedConfig, flags)

  config = runtimeConfig

  useLogger().withFields(config).log('Config loaded')
  return config
}

export async function updateConfig(newConfig: Partial<Config>) {
  const validatedConfig = validateAndMergeConfig(newConfig, config)
  useLogger().withFields({ config: validatedConfig }).log('Updating config')

  if (isBrowser()) {
    const { useLocalStorage } = await import('@vueuse/core')
    const configStorage = useLocalStorage(CONFIG_STORAGE_KEY, generateDefaultConfig())

    config = validatedConfig
    configStorage.value = config

    return config
  }

  const { useConfigPath } = await import('./node/path')
  const { writeFileSync } = await import('node:fs')
  const { stringify } = await import('yaml')

  validatedConfig.database.url = getDatabaseDSN(validatedConfig)

  const configPath = await useConfigPath()
  writeFileSync(configPath, stringify(validatedConfig))

  config = validatedConfig
  return config
}

export function useConfig(): Config {
  if (!config) {
    throw new Error('Config not initialized')
  }

  return config
}
