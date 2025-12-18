import type { Logger } from '@guiiai/logg'

import type { CoreContext } from '../context'

import { useAvatarHelper } from '../message-resolvers/avatar-resolver'

export function registerAvatarEventHandlers(ctx: CoreContext, logger: Logger) {
  logger = logger.withContext('core:avatar:event')
  const helper = useAvatarHelper(ctx, logger)

  ctx.emitter.on('avatar:fetch', async ({ items }) => {
    if (!items || items.length === 0)
      return

    logger.withFields({ count: items.length }).debug('Batch fetching avatars')
    await helper.fetchAvatars(items)
  })
}
