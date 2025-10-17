import type { Api } from 'telegram'

import type { MessageResolver, MessageResolverOpts } from '.'
import type { CoreContext } from '../context'
import type { CoreMessageMediaFromCache, CoreMessageMediaFromServer } from '../utils/media'
import type { CoreMessage } from '../utils/message'

// eslint-disable-next-line unicorn/prefer-node-protocol
import { Buffer } from 'buffer'

import { useLogger } from '@unbird/logg'

import { findPhotoByFileId, findStickerByFileId } from '../models'
import { processMediaInWorker } from '../workers/media-pool'

export function createMediaResolver(ctx: CoreContext): MessageResolver {
  const logger = useLogger('core:resolver:media')

  return {
    async* stream(opts: MessageResolverOpts) {
      logger.verbose('Executing media resolver')

      for (const message of opts.messages) {
        if (!message.media || message.media.length === 0) {
          continue
        }

        const fetchedMedia = await Promise.all(
          message.media.map(async (media) => {
            logger.withFields({ media }).debug('Media')

            // FIXME: move it to storage
            if (media.type === 'sticker') {
              const sticker = (await findStickerByFileId(media.platformId)).unwrap()

              // 只有当数据库中有 sticker_bytes 时才直接返回
              if (sticker && sticker.sticker_bytes) {
                const byte = Buffer.from(sticker.sticker_bytes)

                // Use worker pool for file type detection
                const { mimeType } = await processMediaInWorker({
                  messageUUID: message.uuid,
                  byte,
                  type: media.type,
                  platformId: media.platformId,
                })

                return {
                  messageUUID: message.uuid,
                  byte,
                  type: media.type,
                  platformId: media.platformId,
                  mimeType,
                } satisfies CoreMessageMediaFromCache
              }
            }

            // FIXME: move it to storage
            if (media.type === 'photo') {
              const photo = (await findPhotoByFileId(media.platformId)).unwrap()
              if (photo && photo.image_bytes) {
                const byte = Buffer.from(photo.image_bytes)

                // Use worker pool for file type detection
                const { mimeType } = await processMediaInWorker({
                  messageUUID: message.uuid,
                  byte,
                  type: media.type,
                  platformId: media.platformId,
                })

                return {
                  messageUUID: message.uuid,
                  byte,
                  type: media.type,
                  platformId: media.platformId,
                  mimeType,
                } satisfies CoreMessageMediaFromServer
              }
            }

            const mediaFetched = await ctx.getClient().downloadMedia(media.apiMedia as Api.TypeMessageMedia)
            const byte = mediaFetched instanceof Buffer ? mediaFetched : undefined

            if (!byte) {
              logger.warn(`Media is not a buffer, ${mediaFetched?.constructor.name}`)
            }

            // Use worker pool for file type detection when byte is available
            let mimeType: string | undefined
            if (byte) {
              const result = await processMediaInWorker({
                messageUUID: message.uuid,
                byte,
                type: media.type,
                platformId: media.platformId,
              })
              mimeType = result.mimeType
            }

            return {
              messageUUID: message.uuid,
              apiMedia: media.apiMedia,
              byte,
              type: media.type,
              platformId: media.platformId,
              mimeType,
            } satisfies CoreMessageMediaFromServer
          }),
        )

        yield {
          ...message,
          media: fetchedMedia,
        } satisfies CoreMessage
      }
    },
  }
}
