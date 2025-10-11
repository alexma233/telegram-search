import type { Api } from 'telegram'

import type { CoreContext } from '../context'
import type { MessageResolverRegistryFn } from '../message-resolvers'

import { useConfig } from '@tg-search/common'
import { useLogger } from '@unbird/logg'

import { EmbeddingAPIError } from '../utils/embed'
import { convertToCoreMessage } from '../utils/message'

export interface MessageResolverEventToCore {
  'message:process': (data: { messages: Api.Message[] }) => void
  'message:reprocess': (data: { chatIds?: string[], resolvers?: string[] }) => void
}

export interface MessageResolverEventFromCore {
  'message:resolver:error': (data: { resolverName: string, error: Error, isRateLimited?: boolean }) => void
}

export type MessageResolverEvent = MessageResolverEventFromCore & MessageResolverEventToCore

export type MessageResolverService = ReturnType<ReturnType<typeof createMessageResolverService>>

export function createMessageResolverService(ctx: CoreContext) {
  const logger = useLogger('core:message-resolver:service')

  return (resolvers: MessageResolverRegistryFn) => {
    const { emitter } = ctx

    // Helper function to run resolvers on core messages
    async function runResolvers(coreMessages: any[], enabledResolverNames?: string[]) {
      const disabledResolvers = useConfig().resolvers.disabledResolvers || []

      // Embedding or resolve messages
      const promises = Array.from(resolvers.registry.entries())
        .filter(([name]) => {
          // If specific resolvers are requested, only run those
          if (enabledResolverNames && enabledResolverNames.length > 0) {
            return enabledResolverNames.includes(name)
          }
          // Otherwise, run all except disabled
          return !disabledResolvers.includes(name)
        })
        .map(([name, resolver]) => (async () => {
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
                emitter.emit('message:data', { messages: [message] })
                emitter.emit('storage:record:messages', { messages: [message] })
              }
            }
          }
          catch (error: any) {
            logger.withError(error).warn(`Failed to process messages with ${name} resolver`)
            
            // Emit error event for handling at higher levels (e.g., UI notifications)
            if (error instanceof EmbeddingAPIError) {
              emitter.emit('message:resolver:error', {
                resolverName: name,
                error,
                isRateLimited: error.isRateLimited,
              })
            }
            else {
              emitter.emit('message:resolver:error', {
                resolverName: name,
                error: error instanceof Error ? error : new Error(String(error)),
              })
            }
          }
        })())

      await Promise.allSettled(promises)
    }

    // TODO: worker_threads?
    async function processMessages(messages: Api.Message[]) {
      logger.withFields({ count: messages.length }).verbose('Process messages')

      const coreMessages = messages
        .map(message => convertToCoreMessage(message).orUndefined())
        .filter(message => message != null)

      logger.withFields({ count: coreMessages.length }).debug('Converted messages')

      // TODO: Query user database to get user info

      // Return the messages first
      emitter.emit('message:data', { messages: coreMessages })

      // Storage the messages first
      emitter.emit('storage:record:messages', { messages: coreMessages })

      await runResolvers(coreMessages)
    }

    async function reprocessMessages(chatIds?: string[], resolverNames?: string[]) {
      logger.withFields({ chatIds, resolverNames }).verbose('Reprocess messages')

      // TODO: Query messages from database by chatIds and run specific resolvers
      // For now, this is a placeholder that shows the intent
      // Implementation would require querying the database and converting to CoreMessage format
      logger.warn('Reprocess messages not fully implemented yet - database query needed')
    }

    return {
      processMessages,
      reprocessMessages,
    }
  }
}
