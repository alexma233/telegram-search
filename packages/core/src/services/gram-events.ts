import type { Api } from 'telegram'

import type { CoreContext } from '../context'

import { useConfig } from '@tg-search/common'
import { NewMessage } from 'telegram/events'

export interface GramEventsEventToCore {}

export interface GramEventsEventFromCore {
  'gram:message:received': (data: { message: Api.Message }) => void
}

export type GramEventsEvent = GramEventsEventFromCore & GramEventsEventToCore
export type GramEventsService = ReturnType<typeof createGramEventsService>

export function createGramEventsService(ctx: CoreContext) {
  const { emitter, getClient } = ctx

  function registerGramEvents() {
    // Register a generic event handler that checks config dynamically
    getClient().addEventHandler((event) => {
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
          // Convert peerId to string for comparison
          let peerIdStr: string | undefined

          if ('userId' in peerId) {
            peerIdStr = peerId.userId?.toString()
          }
          else if ('chatId' in peerId) {
            peerIdStr = peerId.chatId?.toString()
          }
          else if ('channelId' in peerId) {
            peerIdStr = peerId.channelId?.toString()
          }

          if (peerIdStr && listenToChatIds.includes(peerIdStr)) {
            isFromListenedChat = true
          }
        }

        if (isFromListenedChat) {
          emitter.emit('gram:message:received', { message: event.message })
        }
      }
    }, new NewMessage({}))
  }

  return {
    registerGramEvents,
  }
}
