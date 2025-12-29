import type { AnnualReportStats } from '@tg-search/core'

import { useLogger } from '@guiiai/logg'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { useBridge } from '../composables/useBridge'

export const useAnnualReportStore = defineStore('annual-report', () => {
  const logger = useLogger('client:annual-report:store')
  const bridge = useBridge()

  const stats = ref<AnnualReportStats | null>(null)
  const isFetching = ref(false)
  const progress = ref(0)
  const progressLabel = ref<string | null>(null)
  const error = ref<string | null>(null)

  function fetchAnnualReport(year: number) {
    if (isFetching.value)
      return

    logger.withFields({ year }).log('Requesting annual report')
    isFetching.value = true
    progress.value = 0
    progressLabel.value = null
    error.value = null

    bridge.sendEvent('message:fetch:annual-report', { year })
  }

  function setStats(newStats: AnnualReportStats) {
    stats.value = newStats
    isFetching.value = false
    progress.value = 100
  }

  function setProgress(newProgress: number, label?: string) {
    progress.value = newProgress
    if (label) {
      progressLabel.value = label
    }
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
    progress,
    progressLabel,
    error,
    fetchAnnualReport,
    setStats,
    setProgress,
    setFetching,
    setError,
  }
})
