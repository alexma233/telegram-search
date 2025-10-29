import type { ClientRegisterEventHandlerFn } from '.'

import { useMessageStore } from '../stores/useMessage'
import { useSyncTaskStore } from '../stores/useSyncTask'

export function registerMessageEventHandlers(
  registerEventHandler: ClientRegisterEventHandlerFn,
) {
  registerEventHandler('message:data', ({ messages }) => {
    useMessageStore().pushMessages(messages)
  })

  registerEventHandler('message:reprocess:task:progress', (data) => {
    useSyncTaskStore().currentTask = data
  })
}
