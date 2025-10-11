import type { MessageResolver, MessageResolverOpts } from '.'
import type { CoreMessage } from '../utils/message'

import { EmbeddingDimension } from '@tg-search/common'
import { useLogger } from '@unbird/logg'
import { Err, Ok } from '@unbird/result'

import { embedContents, EmbeddingAPIError } from '../utils/embed'

export function createEmbeddingResolver(): MessageResolver {
  const logger = useLogger('core:resolver:embedding')

  return {
    run: async (opts: MessageResolverOpts) => {
      logger.verbose('Executing embedding resolver')

      if (opts.messages.length === 0)
        return Err('No messages')

      const messages: CoreMessage[] = opts.messages.filter(
        message => message.content
          && (message.vectors.vector1024?.length === 0
            || message.vectors.vector1536?.length === 0
            || message.vectors.vector768?.length === 0),
      )

      if (messages.length === 0)
        return Err('No messages to embed')

      logger.withFields({ messages: messages.length }).verbose('Embedding messages')

      const result = await embedContents(messages.map(message => message.content))
      if (result.isErr()) {
        const error = result.unwrapErr()
        if (error instanceof EmbeddingAPIError) {
          if (error.isRateLimited) {
            logger.warn('Embedding API rate limited, skipping batch')
          }
          else {
            logger.error('Embedding API failed, skipping batch')
          }
        }
        // Re-throw the error to be handled at a higher level
        throw error
      }

      const { embeddings, usage, dimension } = result.unwrap()

      // if (message.sticker != null) {
      //   text = `A sticker sent by user ${await findStickerDescription(message.sticker.file_id)}, sticker set named ${message.sticker.set_name}`
      // }
      // else if (message.photo != null) {
      //   text = `A set of photo, descriptions are: ${(await Promise.all(message.photo.map(photo => findPhotoDescription(photo.file_id)))).join('\n')}`
      // }
      // else if (message.text) {
      //   text = message.text || message.caption || ''
      // }

      logger.withFields({ embeddings: embeddings.length, usage }).verbose('Embedding messages done')

      for (const [index, message] of messages.entries()) {
        switch (dimension) {
          case EmbeddingDimension.DIMENSION_1536:
            message.vectors.vector1536 = embeddings[index]
            break
          case EmbeddingDimension.DIMENSION_1024:
            message.vectors.vector1024 = embeddings[index]
            break
          case EmbeddingDimension.DIMENSION_768:
            message.vectors.vector768 = embeddings[index]
            break
          default:
            throw new Error(`Unsupported embedding dimension: ${dimension}`)
        }
      }

      return Ok(messages)
    },
  }
}
