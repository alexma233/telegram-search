import type { Logger } from '@guiiai/logg'
import type { EventBuilder } from 'telegram/events/common'

import type { CoreContext } from '../context'

import { NewMessage, NewMessageEvent } from 'telegram/events'

export type GramEventsService = ReturnType<typeof createGramEventsService>

export function createGramEventsService(ctx: CoreContext, logger: Logger) {
  logger = logger.withContext('core:gram-events')

  // Store event handler reference and event type for cleanup
  let eventHandler: ((event: any) => void) | undefined
  let eventType: NewMessage | undefined

  function registerGramEvents() {
    // Prevent duplicate registration
    if (eventHandler) {
      logger.debug('Telegram event handler already registered')
      return
    }

    eventHandler = async (event: EventBuilder) => {
      // TODO: should we store the account settings into ctx, to avoid fetching it from db every time?
      // Is there a way to notify the service when the account settings change?
      const shouldReceive = (await ctx.getAccountSettings()).receiveMessages?.receiveAll

      if (shouldReceive && event instanceof NewMessageEvent && event.message) {
        ctx.emitter.emit('gram:message:received', { message: event.message })
      }
    }
    eventType = new NewMessage({})
    ctx.getClient().addEventHandler(eventHandler, eventType)
    logger.debug('Registered Telegram event handler')
  }

  function cleanup() {
    if (eventHandler && eventType) {
      try {
        const client = ctx.getClient()
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
  ctx.emitter.once('core:cleanup', cleanup)

  return {
    registerGramEvents,
    cleanup,
  }
}
