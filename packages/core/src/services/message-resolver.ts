import type { Api } from 'telegram'

import type { CoreContext } from '../context'
import type { MessageResolverRegistryFn } from '../message-resolvers'
import type { CoreMessage } from '../utils/message'

import { useLogger } from '@guiiai/logg'
import { useConfig } from '@tg-search/common'

import { convertToCoreMessage } from '../utils/message'

export interface MessageResolverEventToCore {
  /**
   * Processes messages. If `isTakeout` is true, suppresses 'message:data' emissions (browser-facing)
   * while still recording messages to storage. Consumers should be aware that setting `isTakeout`
   * changes event side effects.
   */
  'message:process': (data: { messages: Api.Message[], isTakeout?: boolean }) => void
  /**
   * Reprocesses already synced messages for specific chats with selected resolvers or all resolvers.
   * This allows re-running message processing pipeline on existing messages.
   */
  'message:reprocess': (data: { chatIds: string[], resolvers?: string[] }) => void
}

export interface MessageResolverEventFromCore {
  'message:reprocess:progress': (data: { chatId: string, processed: number, total: number }) => void
  'message:reprocess:complete': (data: { chatIds: string[] }) => void
}

export type MessageResolverEvent = MessageResolverEventFromCore & MessageResolverEventToCore

export type MessageResolverService = ReturnType<ReturnType<typeof createMessageResolverService>>

export function createMessageResolverService(ctx: CoreContext) {
  const logger = useLogger('core:message-resolver:service')

  return (resolvers: MessageResolverRegistryFn) => {
    const { emitter } = ctx

    // Helper function to process core messages with resolvers
    async function processCoreMessagesWithResolvers(
      coreMessages: CoreMessage[],
      options: { takeout?: boolean, selectedResolvers?: string[] } = {},
    ) {
      const disabledResolvers = useConfig().resolvers.disabledResolvers || []

      // Determine which resolvers to run
      let resolversToRun = Array.from(resolvers.registry.entries())
        .filter(([name]) => !disabledResolvers.includes(name))

      // If specific resolvers are selected, filter to only those
      if (options.selectedResolvers && options.selectedResolvers.length > 0) {
        resolversToRun = resolversToRun.filter(([name]) => options.selectedResolvers!.includes(name))
      }

      // Embedding or resolve messages
      const promises = resolversToRun.map(([name, resolver]) => (async () => {
        logger.withFields({ name }).verbose('Process messages with resolver')

        try {
          if (resolver.run) {
            const result = (await resolver.run({ messages: coreMessages })).unwrap()

            if (result.length > 0) {
              emitter.emit('storage:record:messages', { messages: result })
            }
          }
          else if (resolver.stream) {
            for await (const message of resolver.stream({ messages: coreMessages })) {
              if (!options.takeout) {
                emitter.emit('message:data', { messages: [message] })
              }

              emitter.emit('storage:record:messages', { messages: [message] })
            }
          }
        }
        catch (error) {
          logger.withError(error).warn('Failed to process messages')
        }
      })())

      await Promise.allSettled(promises)
    }

    // TODO: worker_threads?
    async function processMessages(messages: Api.Message[], options: { takeout?: boolean } = {}) {
      logger.withFields({ count: messages.length }).verbose('Process messages')

      const coreMessages = messages
        .map(message => convertToCoreMessage(message).orUndefined())
        .filter(message => message != null)

      logger.withFields({ count: coreMessages.length }).debug('Converted messages')

      // TODO: Query user database to get user info

      // Return the messages first
      if (!options.takeout) {
        emitter.emit('message:data', { messages: coreMessages })
      }

      // Storage the messages first
      emitter.emit('storage:record:messages', { messages: coreMessages })

      await processCoreMessagesWithResolvers(coreMessages, options)
    }

    async function reprocessMessages(chatIds: string[], selectedResolvers?: string[]) {
      logger.withFields({ chatIds, resolvers: selectedResolvers }).log('Reprocess messages')

      // Import fetchMessages dynamically to avoid circular dependencies
      const { fetchMessages } = await import('../models/chat-message')

      for (const chatId of chatIds) {
        let offset = 0
        const limit = 100
        let hasMore = true

        let processedCount = 0
        let totalCount = 0

        // Note: We'll update total count as we process messages

        while (hasMore) {
          try {
            const { coreMessages } = (await fetchMessages(chatId, { limit, offset })).unwrap()

            if (coreMessages.length === 0) {
              hasMore = false
              break
            }

            // Reprocess these messages
            await processCoreMessagesWithResolvers(coreMessages, {
              takeout: true,
              selectedResolvers,
            })

            processedCount += coreMessages.length
            totalCount = processedCount // Update total as we go

            // Emit progress
            emitter.emit('message:reprocess:progress', {
              chatId,
              processed: processedCount,
              total: totalCount,
            })

            offset += limit
            hasMore = coreMessages.length === limit
          }
          catch (error) {
            logger.withError(error).error('Failed to reprocess messages')
            hasMore = false
          }
        }

        logger.withFields({ chatId, count: processedCount }).log('Reprocessed messages for chat')
      }

      emitter.emit('message:reprocess:complete', { chatIds })
    }

    return {
      processMessages,
      reprocessMessages,
    }
  }
}
