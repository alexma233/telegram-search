import type { Logger } from '@guiiai/logg'

import type { CoreContext } from '../context'

import { useAvatarHelper } from '../message-resolvers/avatar-resolver'

export type EntityService = ReturnType<typeof createEntityService>

export function createEntityService(ctx: CoreContext, logger: Logger) {
  logger = logger.withContext('core:entity:service')

  /**
   * Delegate avatar fetching to centralized AvatarHelper to avoid duplication.
   * Keeps caches and in-flight dedup at resolver-level per context.
   */
  const avatarHelper = useAvatarHelper(ctx, logger)

  async function getEntity(uid: string) {
    logger.withFields({ uid }).debug('Getting entity')

    const user = await ctx.getClient().getEntity(uid)
    return user
  }

  /**
   * Fetch a user's avatar via centralized AvatarHelper.
   * Ensures consistent caching and deduplication across services.
   * Optional expectedFileId allows cache validation before fetching.
   */
  async function fetchUserAvatar(userId: string, expectedFileId?: string) {
    await avatarHelper.fetchUserAvatar(userId, expectedFileId)
  }

  /**
   * Prime the avatar LRU cache with fileId information from frontend IndexedDB.
   * This allows subsequent fetchUserAvatar calls to hit cache without entity fetch.
   */
  async function primeUserAvatarCache(userId: string, fileId: string) {
    avatarHelper.primeUserAvatarCache(userId, fileId)
  }

  /**
   * Prime the chat avatar LRU cache with fileId information from frontend IndexedDB.
   * This allows subsequent fetchDialogAvatar calls to hit cache without entity fetch.
   */
  async function primeChatAvatarCache(chatId: string, fileId: string) {
    avatarHelper.primeChatAvatarCache(chatId, fileId)
  }

  return {
    getEntity,
    fetchUserAvatar,
    primeUserAvatarCache,
    primeChatAvatarCache,
  }
}
