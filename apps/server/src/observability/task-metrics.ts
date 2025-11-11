import type { CoreContext } from '@tg-search/core'

import { useLogger } from '@guiiai/logg'

import {
  takeoutMessagesProcessed,
  takeoutTaskDuration,
  takeoutTaskProgress,
  takeoutTasksActive,
  takeoutTasksTotal,
} from './metrics'

const logger = useLogger('observability:task-metrics')

// Track task start times for duration calculation
const taskStartTimes = new Map<string, number>()

/**
 * Register event listeners to collect metrics for takeout tasks
 */
export function registerTaskMetrics(ctx: CoreContext) {
  const { emitter } = ctx

  // Listen to takeout task progress events
  emitter.on('takeout:task:progress', (task) => {
    const { taskId, progress, type } = task

    // Track task lifecycle
    if (progress === 0 && !taskStartTimes.has(taskId)) {
      // Task started
      takeoutTasksTotal.inc({ status: 'created' })
      takeoutTasksActive.inc()
      taskStartTimes.set(taskId, Date.now())
      logger.withFields({ taskId, type }).verbose('Takeout task started')
    }
    else if (progress === 100) {
      // Task completed
      takeoutTasksTotal.inc({ status: 'completed' })
      takeoutTasksActive.dec()

      // Record duration
      const startTime = taskStartTimes.get(taskId)
      if (startTime) {
        const duration = (Date.now() - startTime) / 1000 // Convert to seconds
        takeoutTaskDuration.observe({ status: 'completed' }, duration)
        taskStartTimes.delete(taskId)
        logger.withFields({ taskId, duration }).verbose('Takeout task completed')
      }

      // Clean up progress gauge
      takeoutTaskProgress.remove(taskId)
    }
    else {
      // Update progress
      takeoutTaskProgress.set({ task_id: taskId }, progress)
    }

    // Log errors if present
    if (task.lastError) {
      logger.withFields({ taskId, error: task.lastError }).warn('Takeout task error')
    }
  })

  // Listen to message processing events to count processed messages
  emitter.on('message:data', ({ messages }) => {
    if (messages.length > 0) {
      // Increment message counter for each chat
      const messagesByChatId = new Map<string, number>()
      for (const message of messages) {
        const chatId = String(message.chatId)
        messagesByChatId.set(chatId, (messagesByChatId.get(chatId) || 0) + 1)
      }

      for (const [chatId, count] of messagesByChatId.entries()) {
        takeoutMessagesProcessed.inc({ chat_id: chatId }, count)
      }

      logger.withFields({ totalMessages: messages.length }).verbose('Messages processed')
    }
  })

  // Listen to task abort events
  emitter.on('takeout:task:abort', ({ taskId }) => {
    takeoutTasksTotal.inc({ status: 'aborted' })
    takeoutTasksActive.dec()

    // Record duration
    const startTime = taskStartTimes.get(taskId)
    if (startTime) {
      const duration = (Date.now() - startTime) / 1000
      takeoutTaskDuration.observe({ status: 'aborted' }, duration)
      taskStartTimes.delete(taskId)
    }

    // Clean up progress gauge
    takeoutTaskProgress.remove(taskId)

    logger.withFields({ taskId }).verbose('Takeout task aborted')
  })

  logger.log('Task metrics registered')
}
