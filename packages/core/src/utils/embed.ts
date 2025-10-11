import type { Result } from '@unbird/result'
import type { EmbedManyResult } from '@xsai/embed'

import { EmbeddingProvider, useConfig } from '@tg-search/common'
import { useLogger } from '@unbird/logg'
import { Err, Ok } from '@unbird/result'
import { createOllama } from '@xsai-ext/providers-local'
import { embedMany } from '@xsai/embed'

export class EmbeddingAPIError extends Error {
  constructor(message: string, public readonly isRateLimited: boolean = false, public readonly originalError?: unknown) {
    super(message)
    this.name = 'EmbeddingAPIError'
  }
}

export async function embedContents(contents: string[]): Promise<Result<EmbedManyResult & { dimension: number }>> {
  const embeddingConfig = useConfig().api.embedding
  const logger = useLogger('core:embed')

  try {
    let embeddings: EmbedManyResult
    switch (embeddingConfig.provider) {
      case EmbeddingProvider.OPENAI:
        embeddings = await embedMany({
          apiKey: embeddingConfig.apiKey,
          baseURL: embeddingConfig.apiBase || '',
          input: contents,
          model: embeddingConfig.model,
        })
        break
      case EmbeddingProvider.OLLAMA:
        embeddings = await embedMany({
          ...createOllama(embeddingConfig.apiBase).chat(embeddingConfig.model),
          input: contents,
        })
        break
      default:
        throw new Error(`Unsupported embedding model: ${embeddingConfig.provider}`)
    }

    return Ok({
      ...embeddings,
      dimension: embeddingConfig.dimension,
    })
  }
  catch (err: any) {
    // Detect rate limiting errors
    const isRateLimited = err?.message?.includes('rate limit')
      || err?.message?.includes('429')
      || err?.message?.includes('Too Many Requests')
      || err?.statusCode === 429
      || err?.status === 429

    // Detect other API errors
    const isAPIError = err?.message?.includes('API')
      || err?.message?.includes('401')
      || err?.message?.includes('403')
      || err?.message?.includes('invalid')
      || err?.statusCode >= 400
      || err?.status >= 400

    if (isRateLimited) {
      logger.withError(err).warn('Embedding API rate limited')
      return Err(new EmbeddingAPIError('Embedding API rate limit exceeded. Please try again later.', true, err))
    }
    else if (isAPIError) {
      logger.withError(err).error('Embedding API failed')
      return Err(new EmbeddingAPIError(`Embedding API failed: ${err?.message || 'Unknown error'}`, false, err))
    }
    else {
      logger.withError(err).error('Embedding failed')
      return Err(err)
    }
  }
}
