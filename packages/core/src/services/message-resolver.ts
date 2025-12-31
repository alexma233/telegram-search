import type { Logger } from '@guiiai/logg'
import type { Api } from 'telegram'

import type { CoreContext } from '../context'
import type { MessageResolverRegistryFn } from '../message-resolvers'
import type { SyncOptions } from '../types/events'

import { convertToCoreMessage } from '../utils/message'

export type MessageResolverService = ReturnType<ReturnType<typeof createMessageResolverService>>

export function createMessageResolverService(ctx: CoreContext, logger: Logger) {
  logger = logger.withContext('core:message-resolver:service')

  return (resolvers: MessageResolverRegistryFn) => {
    // TODO: worker_threads?
    async function processMessages(
      messages: Api.Message[],
      options: {
        takeout?: boolean
        syncOptions?: SyncOptions
        forceRefetch?: boolean
      } = {},
    ) {
      const start = performance.now()
      logger.withFields({
        count: messages.length,
        takeout: options.takeout,
        syncOptions: options.syncOptions,
        forceRefetch: options.forceRefetch,
      }).verbose('Process messages')

      // Sort by message ID in reverse order to process in reverse.
      messages = messages.sort((a, b) => Number(b.id) - Number(a.id))

      const coreMessages = messages
        .map(message => convertToCoreMessage(message).orUndefined())
        .filter(message => message != null)

      logger.withFields({ count: coreMessages.length }).debug('Converted messages')

      // TODO: Query user database to get user info

      // Return the messages to client first.
      if (!options.takeout) {
        ctx.emitter.emit('message:data', { messages: coreMessages })
      }

      // Storage the messages first
      ctx.emitter.emit('storage:record:messages', { messages: coreMessages })

      // Avatar resolver is disabled by default (configured in generateDefaultConfig).
      // Current strategy: client-driven, on-demand avatar loading via entity:avatar:fetch.
      const disabledResolvers = (await ctx.getAccountSettings()).resolvers?.disabledResolvers

      // Embedding or resolve messages
      const promises = Array.from(resolvers.registry.entries())
        .filter(([name]) => {
          if (disabledResolvers.includes(name))
            return false
          if (options.syncOptions?.skipMedia && name === 'media')
            return false
          if (options.syncOptions?.skipEmbedding && name === 'embedding')
            return false
          if (options.syncOptions?.skipJieba && name === 'jieba')
            return false
          return true
        })
        .map(([name, resolver]) => (async () => {
          logger.withFields({ name }).verbose('Process messages with resolver')

          const opts = {
            messages: coreMessages,
            rawMessages: messages,
            syncOptions: options.syncOptions,
            forceRefetch: options.forceRefetch,
          }

          try {
            if (resolver.run) {
              const result = (await resolver.run(opts)).unwrap()

              if (result.length > 0) {
                ctx.emitter.emit('storage:record:messages', { messages: result })
              }
            }
            else if (resolver.stream) {
              for await (const message of resolver.stream(opts)) {
                if (!options.takeout) {
                  ctx.emitter.emit('message:data', { messages: [message] })
                }

                ctx.emitter.emit('storage:record:messages', { messages: [message] })
              }
            }
          }
          catch (error) {
            logger.withError(error).warn('Failed to process messages')
          }
        })())

      await Promise.allSettled(promises)

      // Record batch duration if metrics sink is available (Node/server runtime only).
      if (ctx.metrics) {
        const durationMs = performance.now() - start
        const source = options.takeout ? 'takeout' : 'realtime'
        ctx.metrics.messageBatchDuration.observe({ source }, durationMs)
        ctx.metrics.messagesProcessed.inc({ source }, coreMessages.length)
      }
    }

    return {
      processMessages,
    }
  }
}
