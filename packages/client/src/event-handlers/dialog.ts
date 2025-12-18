import type { ClientRegisterEventHandlerFn } from '.'

import { useChatStore } from '../stores/useChat'

/**
 * Register dialog-related client event handlers.
 * Handles base dialog data.
 */
export function registerDialogEventHandlers(
  registerEventHandler: ClientRegisterEventHandlerFn,
) {
  // Base dialog list
  registerEventHandler('dialog:data', (data) => {
    useChatStore().chats = data.dialogs
  })
}
