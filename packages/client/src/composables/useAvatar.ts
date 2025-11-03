import { computed } from 'vue'

import { getCachedAvatar } from '../utils/avatar-cache'
import { useBridgeStore } from './useBridge'

/**
 * Composable to get avatar URL for an entity
 */
export function useAvatar(entityId: string | number | undefined) {
  const bridgeStore = useBridgeStore()

  const avatarUrl = computed(() => {
    if (!entityId)
      return undefined

    const session = bridgeStore.getActiveSession()
    if (!session?.avatarUrls)
      return undefined

    return session.avatarUrls.get(entityId.toString())
  })

  /**
   * Load avatar from cache if not already loaded
   */
  async function loadFromCache() {
    if (!entityId || avatarUrl.value)
      return

    const session = bridgeStore.getActiveSession()
    if (!session)
      return

    try {
      const cachedUrl = await getCachedAvatar(entityId.toString())
      if (cachedUrl) {
        if (!session.avatarUrls) {
          session.avatarUrls = new Map()
        }
        session.avatarUrls.set(entityId.toString(), cachedUrl)
      }
    }
    catch (error) {
      console.error('Failed to load avatar from cache:', error)
    }
  }

  /**
   * Request avatar from server
   */
  function fetchAvatar() {
    if (!entityId)
      return

    bridgeStore.sendEvent('entity:avatar:fetch', { entityId: entityId.toString() })
  }

  return {
    avatarUrl,
    loadFromCache,
    fetchAvatar,
  }
}
