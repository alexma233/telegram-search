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

  // In-memory cache for entities fetched from Telegram API during this session
  const entities = new Map<string, Entity>()

  // In-memory cache for user database records to avoid repeated DB queries
  const userCache = new Map<string, DBSelectUser>()
  const userBlockedList = new Set<string>()

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
        const cacheKey = `telegram:${message.fromId}`

        // Check in-memory cache first
        let dbUser = userCache.get(cacheKey)

        if (!dbUser) {
          // Check database
          const dbUserOrNull = (await userModels.findUserByPlatformId(ctx.getDB(), 'telegram', message.fromId)).orUndefined()

          if (dbUserOrNull) {
            dbUser = dbUserOrNull
            userCache.set(cacheKey, dbUser)
            logger.withFields({ userId: dbUser.id, fromId: message.fromId }).debug('User found in database')
          }
        }

        // If user not found in cache or database, fetch from Telegram API
        if (!dbUser) {
          if (userBlockedList.has(message.fromId)) {
            continue
          }

          if (!entities.has(message.fromId)) {
            // Prefer using already-resolved sender entity from raw messages.
            const senderEntity = senderEntityByFromId.get(message.fromId)
            if (senderEntity) {
              entities.set(message.fromId, senderEntity)
              logger.withFields({ fromId: message.fromId }).debug('Resolved entity from raw message sender')
            }
            else {
              try {
                const entity = await ctx.getClient().getEntity(message.fromId)
                entities.set(message.fromId, entity)
                logger.withFields(entity).debug('Resolved entity from Telegram API')
              }
              catch {
                userBlockedList.add(message.fromId)
                logger.withFields({ fromId: message.fromId }).warn('Failed to get entity from Telegram API')
              }
            }
          }

          const entity = entities.get(message.fromId)!
          const coreEntity = resolveEntity(entity).orUndefined()

          if (!coreEntity) {
            continue
          }

          // Save to database
          const recordedUser = await userModels.recordUser(ctx.getDB(), coreEntity)
          dbUser = recordedUser
          userCache.set(cacheKey, dbUser)
          logger.withFields({ userId: dbUser.id, fromId: message.fromId }).debug('User saved to database')
        }

        // Update message with user information
        if (dbUser) {
          message.fromName = dbUser.name
          message.fromUserUuid = dbUser.id
        }
      }

      return Ok(messages)
    },
  }
}
