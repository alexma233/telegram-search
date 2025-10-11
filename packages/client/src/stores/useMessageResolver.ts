import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ResolverError {
  resolverName: string
  error: {
    message: string
    name: string
  }
  isRateLimited?: boolean
  timestamp: number
}

export const useMessageResolverStore = defineStore('message-resolver', () => {
  const lastError = ref<ResolverError | null>(null)

  function clearError() {
    lastError.value = null
  }

  return {
    lastError,
    clearError,
  }
})
