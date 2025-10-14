import type { Config } from '@tg-search/common'

import type { CoreContext } from './context'
import type { SessionService } from './services/session'

import { useLogger } from '@unbird/logg'
import { isBrowser } from '@unbird/logg/utils'

import { useService } from './context'
import { registerBasicEventHandlers } from './event-handlers/auth'
import { registerConfigEventHandlers } from './event-handlers/config'
import { registerDialogEventHandlers } from './event-handlers/dialog'
import { registerEntityEventHandlers } from './event-handlers/entity'
import { registerGramEventsEventHandlers } from './event-handlers/gram-events'
import { registerMessageEventHandlers } from './event-handlers/message'
import { registerMessageResolverEventHandlers } from './event-handlers/message-resolver'
import { registerSessionEventHandlers } from './event-handlers/session'
import { registerStorageEventHandlers } from './event-handlers/storage'
import { registerTakeoutEventHandlers } from './event-handlers/takeout'
import { useMessageResolverRegistry } from './message-resolvers'
import { createEmbeddingResolver } from './message-resolvers/embedding-resolver'
import { createJiebaResolver } from './message-resolvers/jieba-resolver'
import { createLinkResolver } from './message-resolvers/link-resolver'
import { createMediaResolver } from './message-resolvers/media-resolver'
import { createUserResolver } from './message-resolvers/user-resolver'
import { createConfigService } from './services/config'
import { createConnectionService } from './services/connection'
import { createDialogService } from './services/dialog'
import { createEntityService } from './services/entity'
import { createGramEventsService } from './services/gram-events'
import { createMessageService } from './services/message'
import { createMessageResolverService } from './services/message-resolver'
import { createTakeoutService } from './services/takeout'

type EventHandler<T = void> = (ctx: CoreContext, config: Config) => T

export async function basicEventHandler(
  ctx: CoreContext,
  config: Config,
): Promise<EventHandler> {
  const logger = useLogger('core:event-handler')
  const registry = useMessageResolverRegistry()

  const connectionService = useService(ctx, createConnectionService)({
    apiId: Number(config.api.telegram.apiId!),
    apiHash: config.api.telegram.apiHash!,
    proxy: config.api.telegram.proxy,
  })
  const configService = useService(ctx, createConfigService)
  const messageResolverService = useService(ctx, createMessageResolverService)(registry)

  registry.register('media', createMediaResolver(ctx))
  registry.register('user', createUserResolver(ctx))
  registry.register('link', createLinkResolver())
  registry.register('embedding', createEmbeddingResolver())
  registry.register('jieba', createJiebaResolver())

  registerStorageEventHandlers(ctx)
  registerConfigEventHandlers(ctx)(configService)
  registerMessageResolverEventHandlers(ctx)(messageResolverService)

  // Initialize session service and register auth handlers - MUST await!
  logger.log('Loading session service...')
  let sessionService: SessionService

  if (isBrowser()) {
    const { createSessionService } = await import('./services/session.browser')
    sessionService = useService(ctx, createSessionService)
  }
  else {
    const { createSessionService } = await import('./services/session')
    sessionService = useService(ctx, createSessionService)
  }

  logger.log('Registering auth and session event handlers...')
  registerBasicEventHandlers(ctx)(connectionService, sessionService)
  registerSessionEventHandlers(ctx)(sessionService)
  logger.log('✅ Auth and session event handlers registered successfully!')

  return () => {}
}

export function afterConnectedEventHandler(
  ctx: CoreContext,
  _config: Config,
): EventHandler {
  const { emitter } = ctx

  emitter.on('auth:connected', () => {
    const messageService = useService(ctx, createMessageService)
    const dialogService = useService(ctx, createDialogService)
    const takeoutService = useService(ctx, createTakeoutService)
    const entityService = useService(ctx, createEntityService)
    const gramEventsService = useService(ctx, createGramEventsService)

    registerMessageEventHandlers(ctx)(messageService)
    registerDialogEventHandlers(ctx)(dialogService)
    registerTakeoutEventHandlers(ctx)(takeoutService)
    registerEntityEventHandlers(ctx)(entityService)
    registerGramEventsEventHandlers(ctx)(gramEventsService)

    // Init all entities
    emitter.emit('dialog:fetch')
    gramEventsService.registerGramEvents()
  })

  return () => {}
}

export function useEventHandler(
  ctx: CoreContext,
  config: Config,
) {
  const logger = useLogger('core:event-handler')

  async function register(fn: EventHandler | ((ctx: CoreContext, config: Config) => Promise<EventHandler>)) {
    logger.withFields({ fn: fn.name }).log('Registering event handler...')
    await fn(ctx, config)
    logger.withFields({ fn: fn.name }).log('✅ Event handler registered!')
  }

  return {
    register,
  }
}
