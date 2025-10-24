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
    const config = useConfig()
    const { receiveMessage, listenToChatIds } = config.api.telegram

    // If not receiving messages at all, don't register
    if (!receiveMessage && (!listenToChatIds || listenToChatIds.length === 0)) {
      return
    }

    // Determine which chats to listen to
    let chatIds: bigint[] | undefined

    if (listenToChatIds && listenToChatIds.length > 0) {
      // Listen to specific chats
      chatIds = listenToChatIds.map(id => BigInt(id))
    }
    // If receiveMessage is true and no specific chats, listen to all (chatIds remains undefined)

    getClient().addEventHandler((event) => {
      if (event.message) {
        emitter.emit('gram:message:received', { message: event.message })
      }
    }, new NewMessage({ chats: chatIds }))
  }

  return {
    registerGramEvents,
  }
}
