import type { ComputedRef } from 'vue'

import { useAvatarStore, useBridgeStore } from '@tg-search/client'
import { computed, onMounted, toValue, watch } from 'vue'

interface Props {
  entity: 'self' | 'other'
  id: string | number
  entityType?: 'chat' | 'user'
  fileId?: string | number
  name?: string
  size?: 'sm' | 'md' | 'lg'
  ensureOnMount?: boolean
  forceRefresh?: boolean
}

export function useEntityAvatar(props: Readonly<Props>): { src: ComputedRef<string | undefined> } {
  const avatarStore = useAvatarStore()
  const bridgeStore = useBridgeStore()

  const ensure = () => {
    const id = toValue(props.id)
    if (!id)
      return

    const isSelf = props.entity === 'self'
    // For self user, we need to be connected to ensure we get the latest avatar
    // because "self" avatar might change frequently or needs initial sync on connect.
    if (isSelf && !bridgeStore.getActiveSession()?.isConnected)
      return

    const isChat = props.entityType === 'chat'
    const fileId = toValue(props.fileId)
    const sId = String(id)
    const sFileId = fileId !== undefined ? String(fileId) : undefined

    if (isChat) {
      avatarStore.ensureChatAvatar(sId, sFileId)
    }
    else {
      // Logic for User (both self and other)
      // We check if we have a valid avatar, or if the fileId matches what we expect
      const currentFileId = avatarStore.getUserAvatarFileId(sId)
      const needsUpdate = props.forceRefresh
        || !avatarStore.hasValidUserAvatar(sId)
        || (sFileId && currentFileId !== sFileId)

      if (needsUpdate)
        avatarStore.ensureUserAvatar(sId, sFileId, props.forceRefresh)
    }
  }

  if (props.ensureOnMount) {
    onMounted(ensure)
    watch(() => [props.id, props.fileId, props.entityType], ensure)

    // For self user, also re-ensure when connection status changes
    if (props.entity === 'self') {
      watch(() => bridgeStore.getActiveSession()?.isConnected, (connected) => {
        if (connected)
          ensure()
      })
    }
  }

  const src = computed(() => {
    // Determine if we should treat this as a user or chat for URL retrieval
    const isUser = props.entity === 'self' || props.entityType === 'user'
    const id = props.id
    return isUser
      ? avatarStore.getUserAvatarUrl(id)
      : avatarStore.getChatAvatarUrl(id)
  })

  return { src }
}
