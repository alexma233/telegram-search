// eslint-disable-next-line unicorn/prefer-node-protocol
import { Buffer } from 'buffer'

import type { TelegramClient } from 'telegram'
import type { Entity } from 'telegram/define'

import { useLogger } from '@guiiai/logg'

/**
 * Download profile photo for a given entity
 * @param client - TelegramClient instance
 * @param entity - The entity (user, chat, or channel) to download the photo for
 * @returns Buffer containing the photo data or undefined if no photo exists
 */
export async function downloadProfilePhoto(
  client: TelegramClient,
  entity: Entity,
): Promise<Buffer | undefined> {
  const logger = useLogger('core:avatar')

  try {
    // Download the profile photo
    const photo = await client.downloadProfilePhoto(entity, {
      isBig: false, // Use small photo for avatars
    })

    if (photo instanceof Buffer) {
      logger.withFields({ entityId: entity.id }).verbose('Downloaded profile photo')
      return photo
    }

    logger.withFields({ entityId: entity.id }).verbose('No profile photo available')
    return undefined
  }
  catch (error) {
    logger.withError(error).warn('Failed to download profile photo')
    return undefined
  }
}
