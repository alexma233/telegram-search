import type { Config } from './config-schema'

import { ref, watch } from '@vue/reactivity'

export function useConfig() {
  const config = ref<Config>()

  watch(config, (newConfig) => {
    config.value = newConfig
  })

  return config
}
