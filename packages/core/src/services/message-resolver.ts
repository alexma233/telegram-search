import type { Api } from 'telegram'

import type { CoreContext } from '../context'
import type { MessageResolverRegistryFn } from '../message-resolvers'
import type { CoreMessage } from '../utils/message'

import { useLogger } from '@guiiai/logg'
import { useConfig } from '@tg-search/common'

import { convertToCoreMessage } from '../utils/message'
import { createTask } from '../utils/task'

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
  /**
   * Aborts a reprocess task by its task ID
   */
  'message:reprocess:task:abort': (data: { taskId: string }) => void
}

export interface MessageResolverEventFromCore {
  'message:reprocess:task:progress': (data: any) => void
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

    async function reprocessMessages(
      chatIds: string[],
      selectedResolvers?: string[],
      task?: ReturnType<typeof createTask<'reprocess'>>,
    ) {
      logger.withFields({ chatIds, resolvers: selectedResolvers }).log('Reprocess messages')

      // If no task provided, create one (for backward compatibility)
      const reprocessTask = task ?? createTask('reprocess', {
        chatIds,
        resolvers: selectedResolvers,
      }, emitter)

      reprocessTask.markStarted()

      try {
        // Import fetchMessages dynamically to avoid circular dependencies
        const { fetchMessages } = await import('../models/chat-message')

        let totalProcessed = 0
        let totalMessages = 0

        // First pass: count total messages
        for (const chatId of chatIds) {
          try {
            let offset = 0
            const limit = 100
            let hasMore = true

            while (hasMore) {
              const { coreMessages } = (await fetchMessages(chatId, { limit, offset })).unwrap()
              if (coreMessages.length === 0) {
                hasMore = false
                break
              }
              totalMessages += coreMessages.length
              offset += limit
              hasMore = coreMessages.length === limit
            }
          }
          catch (error) {
            logger.withError(error).warn('Failed to count messages')
          }
        }

        // Second pass: process messages
        for (const chatId of chatIds) {
          let offset = 0
          const limit = 100
          let hasMore = true

          let processedCount = 0

          while (hasMore) {
            // Check if task was aborted
            if (reprocessTask.abortController.signal.aborted) {
              logger.log('Reprocess task was aborted')
              return
            }

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
              totalProcessed += coreMessages.length

              // Calculate overall progress percentage
              const progressPercent = totalMessages > 0
                ? Math.floor((totalProcessed / totalMessages) * 100)
                : 0

              // Update task progress
              reprocessTask.updateProgress(
                progressPercent,
                `Processing chat ${chatId}: ${totalProcessed}/${totalMessages} messages`,
              )

              offset += limit
              hasMore = coreMessages.length === limit
            }
            catch (error) {
              logger.withError(error).error('Failed to reprocess messages')
              reprocessTask.updateError(error)
              return
            }
          }

          logger.withFields({ chatId, count: processedCount }).log('Reprocessed messages for chat')
        }

        // Mark task as complete
        reprocessTask.updateProgress(100, 'Reprocessing complete')
      }
      catch (error) {
        logger.withError(error).error('Failed to reprocess messages')
        reprocessTask.updateError(error)
      }
    }

    return {
      processMessages,
      reprocessMessages,
      createReprocessTask(chatIds: string[], resolvers?: string[]) {
        return createTask('reprocess', { chatIds, resolvers }, emitter)
      },
    }
  }
}
