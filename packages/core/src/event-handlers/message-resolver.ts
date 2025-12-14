import type { Logger } from '@guiiai/logg'
import type { Api } from 'telegram'

import type { CoreContext } from '../context'
import type { MessageResolverService } from '../services/message-resolver'

import { newQueue } from '@henrygd/queue'

import { MESSAGE_RESOLVER_QUEUE_SIZE } from '../constants'
import { createTask } from '../utils/task'

export function registerMessageResolverEventHandlers(ctx: CoreContext, logger: Logger) {
  logger = logger.withContext('core:message-resolver:event')

  return (messageResolverService: MessageResolverService) => {
    const queue = newQueue(MESSAGE_RESOLVER_QUEUE_SIZE)
    let processTask: ReturnType<typeof createTask> | undefined
    let totalMessagesQueued = 0
    let totalMessagesProcessed = 0
    let pendingBatches = 0

    const updateProcessProgress = () => {
      if (!processTask || totalMessagesQueued === 0)
        return

      const progress = Number(((totalMessagesProcessed / totalMessagesQueued) * 100).toFixed(2))
      processTask.updateProgress(
        progress,
        `Processed ${totalMessagesProcessed}/${totalMessagesQueued} messages`,
      )
    }

    // TODO: debounce, background tasks
    ctx.emitter.on('message:process', ({ messages, isTakeout = false, syncOptions = {}, forceRefetch = false }) => {
      logger.withFields({ count: messages.length, isTakeout, syncOptions, forceRefetch }).verbose('Processing messages')

      if (!isTakeout) {
        messageResolverService.processMessages(messages, { takeout: isTakeout, syncOptions, forceRefetch }).catch((error) => {
          logger.withError(error).warn('Failed to process realtime messages')
        })

        return
      }

      // Only use queue for takeout mode to avoid overwhelming the system.
      const chatIds = Array.from(new Set(messages.map((message: Api.Message) => {
        const peerId = message.peerId
        if (!peerId)
          return undefined
        if ('channelId' in peerId)
          return peerId.channelId?.toString()
        if ('chatId' in peerId)
          return peerId.chatId?.toString()
        if ('userId' in peerId)
          return peerId.userId?.toString()
        return undefined
      }).filter((id): id is string => Boolean(id))))

      if (!processTask) {
        processTask = createTask('takeout:process', { chatIds, phase: 'process' }, ctx.emitter, logger)
      }
      else if (chatIds.length > 0) {
        processTask.state.metadata.chatIds = Array.from(new Set([...processTask.state.metadata.chatIds, ...chatIds]))
      }

      totalMessagesQueued += messages.length
      pendingBatches += 1
      updateProcessProgress()

      void queue.add(async () => {
        messageResolverService.processMessages(messages, { takeout: isTakeout, syncOptions, forceRefetch }).catch((error) => {
          logger.withError(error).warn('Failed to process takeout messages')
        })
          .finally(() => {
            totalMessagesProcessed += messages.length
            pendingBatches -= 1
            updateProcessProgress()

            if (pendingBatches === 0 && totalMessagesProcessed >= totalMessagesQueued) {
              processTask?.updateProgress(
                100,
                `Processed ${totalMessagesProcessed}/${totalMessagesQueued} messages`,
              )
              processTask = undefined
              totalMessagesQueued = 0
              totalMessagesProcessed = 0
            }
          })
      })
    })
  }
}
