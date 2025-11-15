import type { CoreContext } from '../context'
import type { MessageResolverService } from '../services/message-resolver'

import { useLogger } from '@guiiai/logg'
import { newQueue } from '@henrygd/queue'

import { MESSAGE_RESOLVER_QUEUE_SIZE } from '../constants'

export function registerMessageResolverEventHandlers(ctx: CoreContext) {
  const { emitter } = ctx
  const logger = useLogger('core:message-resolver:event')

  return (messageResolverService: MessageResolverService) => {
    const queue = newQueue(MESSAGE_RESOLVER_QUEUE_SIZE)
    
    // Track total processed messages for progress reporting per task
    const taskProcessedCounts = new Map<string, number>()
    const taskTotalCounts = new Map<string, number>()

    // TODO: debounce, background tasks
    emitter.on('message:process', ({ messages, isTakeout = false, syncOptions, taskId }) => {
      // Track message counts for this task
      if (taskId) {
        const currentTotal = taskTotalCounts.get(taskId) || 0
        taskTotalCounts.set(taskId, currentTotal + messages.length)
      }

      void queue.add(async () => {
        try {
          await messageResolverService.processMessages(messages, { takeout: isTakeout, syncOptions })
          
          // Update processed count and emit progress
          if (taskId) {
            const currentProcessed = taskProcessedCounts.get(taskId) || 0
            const newProcessed = currentProcessed + messages.length
            taskProcessedCounts.set(taskId, newProcessed)
            
            const active = queue.active()
            const pending = queue.size()
            
            emitter.emit('message:process:progress', {
              taskId,
              processed: newProcessed,
              pending,
              active,
            })
            
            // Clean up counts when queue is empty and task is done
            if (pending === 0 && active === 0) {
              taskProcessedCounts.delete(taskId)
              taskTotalCounts.delete(taskId)
            }
          }
        }
        catch (error) {
          logger.withError(error).warn('Failed to process messages')
        }
      })
    })
  }
}
