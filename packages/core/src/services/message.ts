import type { Logger } from '@guiiai/logg'

import type { CoreContext } from '../context'
import type { FetchMessageOpts } from '../types/events'

import { Err, Ok } from '@unbird/result'
import { Api } from 'telegram'

import { resolvePeerByChatId } from '../utils/peer'

export type MessageService = ReturnType<typeof createMessageService>

export function createMessageService(ctx: CoreContext, logger: Logger) {
  logger = logger.withContext('core:message:service')

  async function* fetchMessages(
    chatId: string,
    options: Omit<FetchMessageOpts, 'chatId'>,
  ): AsyncGenerator<Api.Message> {
    if (!await ctx.getClient().isUserAuthorized()) {
      logger.error('User not authorized')
      return
    }

    const limit = options.pagination.limit
    const minId = options?.minId
    const maxId = options?.maxId

    logger.withFields({
      chatId,
      limit,
      minId,
      maxId,
    }).verbose('Fetch messages options')

    try {
      logger.withFields({ limit }).debug('Fetching messages from Telegram server')
      const peer = await resolvePeerByChatId(ctx, chatId)
      const messages = await ctx.getClient()
        .getMessages(peer, {
          limit,
          minId,
          maxId,
          addOffset: options.pagination.offset, // TODO: rename this
        })

      if (messages.length === 0) {
        logger.warn('Get messages failed or returned empty data')
        return Err(new Error('Get messages failed or returned empty data'))
      }

      for (const message of messages) {
        // Skip empty messages
        if (message instanceof Api.MessageEmpty) {
          continue
        }

        yield message
      }
    }
    catch (error) {
      return Err(ctx.withError(error, 'Fetch messages failed'))
    }
  }

  async function sendMessage(chatId: string, content: string) {
    const peer = await resolvePeerByChatId(ctx, chatId)
    const message = await ctx.getClient()
      .invoke(new Api.messages.SendMessage({
        peer,
        message: content,
      }))

    return Ok(message)
  }

  async function fetchSpecificMessages(chatId: string, messageIds: number[]): Promise<Api.Message[]> {
    if (!await ctx.getClient().isUserAuthorized()) {
      logger.error('User not authorized')
      return []
    }

    if (messageIds.length === 0) {
      return []
    }

    try {
      logger.withFields({ chatId, count: messageIds.length }).debug('Fetching specific messages from Telegram')

      // Telegram API getMessages can accept an array of message IDs
      const peer = await resolvePeerByChatId(ctx, chatId)
      const messages = await ctx.getClient().getMessages(peer, {
        ids: messageIds,
      })

      // Filter out empty messages
      return messages.filter((message: Api.Message) => !(message instanceof Api.MessageEmpty))
    }
    catch (error) {
      logger.withError(ctx.withError(error, 'Fetch specific messages failed') as Error).error('Failed to fetch specific messages')
      return []
    }
  }

  return {
    fetchMessages,
    sendMessage,
    fetchSpecificMessages,
  }
}
