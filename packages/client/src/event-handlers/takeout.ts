import type { ClientRegisterEventHandler } from '.'

import { useSyncTaskStore } from '../stores/useSyncTask'

export function registerTakeoutEventHandlers(
  registerEventHandler: ClientRegisterEventHandler,
) {
  registerEventHandler('takeout:task:progress', (data) => {
    const store = useSyncTaskStore()

    if (data.type === 'takeout:process') {
      store.currentTask = data
      return
    }

    if (store.currentTask?.type === 'takeout:process' && (store.currentTask.progress ?? 0) < 100)
      return

    store.currentTask = data
  })

  registerEventHandler('takeout:stats:data', (data) => {
    const store = useSyncTaskStore()
    store.chatStats = data
    store.chatStatsLoading = false
  })
}
