import type { CoreContext } from '../context'
import type { MessageResolverService } from '../services/message-resolver'

import { useLogger } from '@guiiai/logg'
import pLimit from 'p-limit'

import { MESSAGE_PROCESS_LIMIT } from '../constants'
import { createTask } from '../utils/task'

export function registerMessageResolverEventHandlers(ctx: CoreContext) {
  const { emitter } = ctx
  const logger = useLogger('core:message-resolver:event')

  // Store active tasks by taskId for abort handling
  const activeTasks = new Map<string, ReturnType<typeof createTask>>()

  return (messageResolverService: MessageResolverService) => {
    const limit = pLimit(MESSAGE_PROCESS_LIMIT)

    // TODO: debounce, background tasks
    emitter.on('message:process', ({ messages, isTakeout = false }) => {
      void limit(async () => {
        try {
          await messageResolverService.processMessages(messages, { takeout: isTakeout })
        }
        catch (error) {
          logger.withError(error).warn('Failed to process messages')
        }
      })
    })

    emitter.on('message:reprocess', ({ chatIds, resolvers }) => {
      void limit(async () => {
        try {
          // Create task for reprocess operation
          const task = createTask('reprocess', { chatIds, resolvers }, emitter)
          activeTasks.set(task.taskId, task)

          await messageResolverService.reprocessMessages(chatIds, resolvers, task)

          // Clean up task after completion
          activeTasks.delete(task.taskId)
        }
        catch (error) {
          logger.withError(error).error('Failed to reprocess messages')
          ctx.withError(error, 'Failed to reprocess messages')
        }
      })
    })

    emitter.on('message:reprocess:task:abort', ({ taskId }) => {
      logger.withFields({ taskId }).verbose('Aborting reprocess task')
      const task = activeTasks.get(taskId)
      if (task) {
        task.abort()
        activeTasks.delete(taskId)
      }
      else {
        logger.withFields({ taskId }).warn('Task not found for abort')
      }
    })
  }
}
