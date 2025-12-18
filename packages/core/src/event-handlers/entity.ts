import type { Logger } from '@guiiai/logg'

import type { CoreContext } from '../context'
import type { EntityService } from '../services/entity'

export function registerEntityEventHandlers(ctx: CoreContext, logger: Logger) {
  logger = logger.withContext('core:entity:event')

  return (entityService: EntityService) => {
    ctx.emitter.on('entity:avatar:fetch', async ({ userId, fileId }) => {
      logger.withFields({ userId, fileId }).debug('Fetching user avatar')
      await entityService.fetchUserAvatar(userId, fileId)
    })
  }
}
