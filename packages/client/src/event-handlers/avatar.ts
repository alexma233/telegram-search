import type { ClientRegisterEventHandlerFn } from '.'

import { useLogger } from '@guiiai/logg'

import { loadAvatarWithCore } from '../adapters/core-media'
import { getMediaBinaryProvider } from '../adapters/core-media-opfs'
import { useAvatarStore } from '../stores/useAvatar'
import { useChatStore } from '../stores/useChat'

export function registerAvatarEventHandlers(
  registerEventHandler: ClientRegisterEventHandlerFn,
) {
  registerEventHandler('avatar:data', async (data) => {
    const avatarStore = useAvatarStore()
    const chatStore = useChatStore()
    const provider = getMediaBinaryProvider()
    const logger = useLogger('avatar')

    if (!data.items || data.items.length === 0)
      return

    await Promise.allSettled(data.items.map(async (item) => {
      const result = await loadAvatarWithCore(item.kind, item.id, item.fileId, provider)

      if (result) {
        if (item.kind === 'user') {
          avatarStore.setUserAvatar(item.id, {
            blobUrl: result.blobUrl,
            fileId: item.fileId,
            mimeType: result.mimeType,
          })
          avatarStore.markUserFetchCompleted(item.id)
        }
        else {
          // Update chat store fields
          const chatIdNum = Number(item.id)
          const chat = chatStore.chats.find(c => c.id === chatIdNum)
          if (chat) {
            chat.avatarBlobUrl = result.blobUrl
            if (item.fileId)
              chat.avatarFileId = item.fileId
            chat.avatarUpdatedAt = new Date()
          }

          avatarStore.setChatAvatar(item.id, {
            blobUrl: result.blobUrl,
            fileId: item.fileId,
            mimeType: result.mimeType,
          })
          avatarStore.markChatFetchCompleted(item.id)
        }
      }
      else {
        // Clear flags even on failure
        if (item.kind === 'user')
          avatarStore.markUserFetchCompleted(item.id)
        else
          avatarStore.markChatFetchCompleted(item.id)
      }
    }))

    logger.debug('Handled avatar batch update', { count: data.items.length })
  })
}
