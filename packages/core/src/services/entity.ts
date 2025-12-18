import type { Logger } from '@guiiai/logg'

import type { CoreContext } from '../context'

export type EntityService = ReturnType<typeof createEntityService>

export function createEntityService(ctx: CoreContext, logger: Logger) {
  logger = logger.withContext('core:entity:service')

  async function getEntity(uid: string) {
    logger.withFields({ uid }).debug('Getting entity')

    const user = await ctx.getClient().getEntity(uid)
    return user
  }

  return {
    getEntity,
  }
}
