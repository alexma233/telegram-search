import { useLogger } from '@guiiai/logg'
import { generateDefaultAccountSettings } from '@tg-search/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useBridgeStore } from '../composables/useBridge'

export const useAccountStore = defineStore('account', () => {
  const accountSettings = ref(generateDefaultAccountSettings())
  const bridgeStore = useBridgeStore()

  const isReady = ref(false)

  function markReady() {
    if (isReady.value)
      return

    isReady.value = true

    useLogger('AccountStore').verbose('Fetching config for new session')
    bridgeStore.sendEvent('config:fetch')
  }

  function resetReady() {
    isReady.value = false
  }

  return {
    isReady: computed(() => isReady.value),
    markReady,
    resetReady,
    accountSettings,
  }
})
