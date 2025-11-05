import type { ClientRegisterEventHandler } from '.'

import { useSyncTaskStore } from '../stores/useSyncTask'

export function registerTakeoutEventHandlers(
  registerEventHandler: ClientRegisterEventHandler,
) {
  registerEventHandler('takeout:task:progress', (data) => {
    const store = useSyncTaskStore()
    
    // Update the task in the store
    store.setTask(data)
    
    // Auto-remove completed or cancelled tasks after a delay
    if (data.progress === 100 || (data.lastError === 'Task aborted')) {
      setTimeout(() => {
        store.removeTask(data.taskId)
      }, 3000) // Keep completed/cancelled tasks visible for 3 seconds
    }
  })
}
