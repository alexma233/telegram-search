import type { ClientRegisterEventHandler } from '.'

import { useBridgeStore } from '../composables/useBridge'
import { cacheAvatar } from '../utils/avatar-cache'

export function registerEntityEventHandlers(
  registerEventHandler: ClientRegisterEventHandler,
) {
  registerEventHandler('entity:me:data', async (data) => {
    const session = useBridgeStore().getActiveSession()
    if (session) {
      session.me = data

      // Cache the avatar if available
      if (data.avatarBytes) {
        try {
          // Convert Buffer to Uint8Array for browser compatibility
          const bytes = data.avatarBytes instanceof Uint8Array
            ? data.avatarBytes
            : new Uint8Array(data.avatarBytes)
          const avatarUrl = await cacheAvatar(data.id, bytes)
          // Store the avatar URL in session for immediate access
          if (!session.avatarUrls) {
            session.avatarUrls = new Map()
          }
          session.avatarUrls.set(data.id, avatarUrl)
        }
        catch (error) {
          console.error('Failed to cache user avatar:', error)
        }
      }
    }
  })

  registerEventHandler('entity:avatar:data', async (data) => {
    const session = useBridgeStore().getActiveSession()
    if (session && data.avatarBytes) {
      try {
        // Convert Buffer to Uint8Array for browser compatibility
        const bytes = data.avatarBytes instanceof Uint8Array
          ? data.avatarBytes
          : new Uint8Array(data.avatarBytes)
        const avatarUrl = await cacheAvatar(data.entityId, bytes)
        // Store the avatar URL in session
        if (!session.avatarUrls) {
          session.avatarUrls = new Map()
        }
        session.avatarUrls.set(data.entityId, avatarUrl)
      }
      catch (error) {
        console.error('Failed to cache entity avatar:', error)
      }
    }
  })
}
