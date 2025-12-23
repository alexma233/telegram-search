import type { Logger } from '@guiiai/logg'
import type { Entity } from 'telegram/define'

import type { MessageResolver, MessageResolverOpts } from '.'
import type { CoreContext } from '../context'
import type { UserModels } from '../models/users'
import type { DBSelectUser } from '../models/utils/types'

import { Ok } from '@unbird/result'

import { resolveEntity } from '../utils/entity'

export function createUserResolver(ctx: CoreContext, logger: Logger, userModels: UserModels): MessageResolver {
  logger = logger.withContext('core:resolver:user')

  // In-memory cache for user database records to avoid repeated DB queries
  const userCache = new Map<string, DBSelectUser>()
  const userBlockedList = new Set<string>()

  const resolveUser = async (fromId: string, preloadedEntity?: Entity): Promise<DBSelectUser | undefined> => {
    const cacheKey = `telegram:${fromId}`

    // 1. Check in-memory cache
    const cached = userCache.get(cacheKey)
    if (cached) {
      return cached
    }

    // 2. Check database
    const dbUser = (await userModels.findUserByPlatformId(ctx.getDB(), 'telegram', fromId)).orUndefined()
    if (dbUser) {
      userCache.set(cacheKey, dbUser)
      logger.withFields({ userId: dbUser.id, fromId }).debug('User found in database')
      return dbUser
    }

    // 3. Fallback: Fetch from Telegram API or use preloaded entity
    if (userBlockedList.has(fromId)) {
      return undefined
    }

    try {
      let rawEntity: Entity
      if (preloadedEntity) {
        rawEntity = preloadedEntity
        logger.withFields({ fromId }).debug('Resolved entity from raw message sender')
      }
      else {
        rawEntity = await ctx.getClient().getEntity(fromId)
        logger.withFields(rawEntity).debug('Resolved entity from Telegram API')
      }

      const entity = resolveEntity(rawEntity).orUndefined()

      if (!entity) {
        return undefined
      }

      // 4. Record new user to database
      const recordedUser = await userModels.recordUser(ctx.getDB(), entity)
      userCache.set(cacheKey, recordedUser)
      logger.withFields({ userId: recordedUser.id, fromId }).debug('User saved to database')

      return recordedUser
    }
    catch (err) {
      userBlockedList.add(fromId)
      logger.withFields({ fromId }).withError(err).warn('Failed to resolve or save user')
      return undefined
    }
  }

  return {
    run: async (opts: MessageResolverOpts) => {
      logger.verbose('Executing user resolver')

      const { messages, rawMessages } = opts

      // Build a best-effort in-batch sender cache from raw Telegram messages.
      // This avoids extra Telegram API calls and gives us access_hash for InputPeer.
      const senderEntityByFromId = new Map<string, Entity>()
      for (const raw of rawMessages) {
        try {
          const sender = (raw as any).sender as Entity | undefined
          const senderId = (sender as any)?.id?.toString?.()
          if (sender && senderId)
            senderEntityByFromId.set(String(senderId), sender)
        }
        catch {}
      }

      for (const message of messages) {
        const preloadedEntity = senderEntityByFromId.get(message.fromId)
        const dbUser = await resolveUser(message.fromId, preloadedEntity)

        if (dbUser) {
          message.fromName = dbUser.name
          message.fromUserUuid = dbUser.id
        }
      }

      return Ok(messages)
    },
  }
}
