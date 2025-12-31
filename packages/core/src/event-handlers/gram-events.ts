import type { Logger } from '@guiiai/logg'

import type { CoreContext } from '../context'
import type { AccountModels } from '../models/accounts'
import type { GramEventsService } from '../services/gram-events'

export function registerGramEventsEventHandlers(ctx: CoreContext, logger: Logger, accountModels: AccountModels) {
  logger = logger.withContext('core:gram:event')

  return (_: GramEventsService) => {
    ctx.emitter.on('gram:message:received', async ({ message, pts, date }) => {
      logger.withFields({ message: message.id, fromId: message.fromId, content: message.text, pts }).debug('Message received')

      ctx.emitter.emit('message:process', { messages: [message] })

      if (pts) {
        await accountModels.updateAccountState(ctx.getDB(), ctx.getCurrentAccountId(), {
          pts,
          date,
        })
      }
    })
  }
}
