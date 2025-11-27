import type { CoreContext } from '../context'

import { useLogger } from '@guiiai/logg'
import { useConfig } from '@tg-search/common'
import { NewMessage } from 'telegram/events'

export type GramEventsService = ReturnType<typeof createGramEventsService>

export function createGramEventsService(ctx: CoreContext) {
  const { emitter, getClient } = ctx
  const logger = useLogger('core:gram-events')

  // Store event handler reference and event type for cleanup
  let eventHandler: ((event: any) => void) | undefined
  let eventType: NewMessage | undefined

  function registerGramEvents() {
    // Prevent duplicate registration
    if (eventHandler) {
      logger.debug('Telegram event handler already registered')
      return
    }

    eventHandler = (event) => {
      if (!event.message)
        return

      const config = useConfig()
      const { receiveAllMessage, listenToChatIds } = config.api.telegram

      // If receiveAllMessage is true, process all messages
      if (receiveAllMessage) {
        emitter.emit('gram:message:received', { message: event.message })
        return
      }

      // If we have specific chat IDs to listen to, check if this message is from one of them
      if (listenToChatIds && listenToChatIds.length > 0) {
        const chatId = event.message.chatId?.toString()
        const peerId = event.message.peerId

        // Check if the message is from one of the listened chats
        let isFromListenedChat = false

        if (chatId && listenToChatIds.includes(chatId)) {
          isFromListenedChat = true
        }
        else if (peerId) {
          // Simplify peer ID extraction using nullish coalescing
          const peerIdStr = peerId.userId?.toString() ?? peerId.chatId?.toString() ?? peerId.channelId?.toString()

          if (peerIdStr && listenToChatIds.includes(peerIdStr)) {
            isFromListenedChat = true
          }
        }

        if (isFromListenedChat) {
          emitter.emit('gram:message:received', { message: event.message })
        }
      }
    }
    eventType = new NewMessage({})
    getClient().addEventHandler(eventHandler, eventType)
    logger.debug('Registered Telegram event handler')
  }

  function cleanup() {
    if (eventHandler && eventType) {
      try {
        const client = getClient()
        if (client) {
          client.removeEventHandler(eventHandler, eventType)
          logger.debug('Removed Telegram event handler')
        }
      }
      catch (error) {
        logger.withError(error).warn('Failed to remove Telegram event handler')
      }
      eventHandler = undefined
      eventType = undefined
    }
  }

  // Listen for cleanup event
  emitter.once('core:cleanup', cleanup)

  return {
    registerGramEvents,
    cleanup,
  }
}
