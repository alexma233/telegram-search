import type { ClientRegisterEventHandlerFn } from '.'

import { useBridgeStore } from '../composables/useBridge'
import { useChatStore } from '../stores/useChat'
import { cacheAvatar } from '../utils/avatar-cache'

export function registerDialogEventHandlers(
  registerEventHandler: ClientRegisterEventHandlerFn,
) {
  registerEventHandler('dialog:data', async (data) => {
    useChatStore().chats = data.dialogs

    // Cache avatars for all dialogs
    const session = useBridgeStore().getActiveSession()
    if (session) {
      if (!session.avatarUrls) {
        session.avatarUrls = new Map()
      }

      for (const dialog of data.dialogs) {
        if (dialog.avatarBytes) {
          try {
            // Convert Buffer to Uint8Array for browser compatibility
            const bytes = dialog.avatarBytes instanceof Uint8Array
              ? dialog.avatarBytes
              : new Uint8Array(dialog.avatarBytes)
            const avatarUrl = await cacheAvatar(dialog.id.toString(), bytes)
            session.avatarUrls.set(dialog.id.toString(), avatarUrl)
          }
          catch (error) {
            console.error(`Failed to cache avatar for dialog ${dialog.id}:`, error)
          }
        }
      }
    }
  })
}
