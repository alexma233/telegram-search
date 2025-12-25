import type { Logger } from '@guiiai/logg'

import type { CoreContext } from '../context'
import type { GramEventsService } from '../services/gram-events'

export function registerGramEventsEventHandlers(ctx: CoreContext, logger: Logger) {
  logger = logger.withContext('core:gram:event')

  return (_: GramEventsService) => {
    ctx.emitter.on('gram:message:received', ({ message }) => {
      logger.withFields({ message: message.id, fromId: message.fromId, content: message.text }).debug('Message received')

      ctx.emitter.emit('message:process', { messages: [message] })
    })
  }
}
