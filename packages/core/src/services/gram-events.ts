import type { NewMessageEvent } from 'telegram/events'

import type { CoreContext } from '../context'

import { useConfig } from '@tg-search/common'
import { NewMessage } from 'telegram/events'

export type GramEventsService = ReturnType<typeof createGramEventsService>

export function createGramEventsService(ctx: CoreContext) {
  const { emitter, getClient } = ctx
  let eventHandlerCallback: ((event: NewMessageEvent) => void) | undefined

  function registerGramEvents() {
    // Define the callback first so we can remove it later
    eventHandlerCallback = (event: NewMessageEvent) => {
      if (event.message && useConfig().api.telegram.receiveMessage) {
        emitter.emit('gram:message:received', { message: event.message })
      }
    }

    getClient().addEventHandler(eventHandlerCallback, new NewMessage({}))
  }

  function unregisterGramEvents() {
    if (eventHandlerCallback) {
      getClient().removeEventHandler(eventHandlerCallback, new NewMessage({}))
      eventHandlerCallback = undefined
    }
  }

  return {
    registerGramEvents,
    unregisterGramEvents,
  }
}
