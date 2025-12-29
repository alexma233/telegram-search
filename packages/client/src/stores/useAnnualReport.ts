import type { AnnualReportStats } from '@tg-search/core'

import { useLogger } from '@guiiai/logg'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { useSessionStore } from './useSession'

export const useAnnualReportStore = defineStore('annual-report', () => {
  const logger = useLogger('client:annual-report:store')
  const sessionStore = useSessionStore()

  const stats = ref<AnnualReportStats | null>(null)
  const isFetching = ref(false)
  const error = ref<string | null>(null)

  function fetchAnnualReport(year: number) {
    if (isFetching.value)
      return

    logger.withFields({ year }).log('Requesting annual report')
    isFetching.value = true
    error.value = null

    sessionStore.sendEvent('message:fetch:annual-report', { year })
  }

  function setStats(newStats: AnnualReportStats) {
    stats.value = newStats
    isFetching.value = false
  }

  function setFetching(fetching: boolean) {
    isFetching.value = fetching
  }

  function setError(err: string | null) {
    error.value = err
    isFetching.value = false
  }

  return {
    stats,
    isFetching,
    error,
    fetchAnnualReport,
    setStats,
    setFetching,
    setError,
  }
})

