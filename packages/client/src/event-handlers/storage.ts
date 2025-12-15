import type { ClientRegisterEventHandler } from '.'

import { useChatStore } from '../stores/useChat'
import { useMessageStore } from '../stores/useMessage'

/**
 * Register storage-related client event handlers.
 * Handles dialogs/messages hydration and batch-prefills chat avatars from IndexedDB for faster initial UX.
 */
export function registerStorageEventHandlers(
  registerEventHandler: ClientRegisterEventHandler,
) {
  registerEventHandler('storage:dialogs', (data) => {
    const chatStore = useChatStore()
    chatStore.chats = data.dialogs
  })

  registerEventHandler('storage:messages', ({ messages }) => {
    useMessageStore().pushMessages(messages)
  })

  // Wait for result event
  registerEventHandler('storage:search:messages:data', (_) => {})
  registerEventHandler('storage:messages:context', (_) => {})
}
