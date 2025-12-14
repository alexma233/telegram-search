import type { ClientRegisterEventHandler } from '.'

import { useSyncTaskStore } from '../stores/useSyncTask'

export function registerTakeoutEventHandlers(
  registerEventHandler: ClientRegisterEventHandler,
) {
  registerEventHandler('takeout:task:progress', (data) => {
    const store = useSyncTaskStore()
    store.upsertTask(data)
  })

  registerEventHandler('takeout:stats:data', (data) => {
    const store = useSyncTaskStore()
    store.chatStats = data
    store.chatStatsLoading = false
  })
}
