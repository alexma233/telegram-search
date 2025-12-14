// https://github.com/moeru-ai/airi/blob/main/services/telegram-bot/src/models/chats.ts

import type { CoreDB } from '../db'
import type { CoreDialog } from '../types/dialog'
import type { PromiseResult } from '../utils/result'
import type { DBSelectChat } from './utils/types'

import { and, desc, eq, sql } from 'drizzle-orm'

import { accountJoinedChatsTable } from '../schemas/account-joined-chats'
import { chatMessagesTable } from '../schemas/chat-messages'
import { joinedChatsTable } from '../schemas/joined-chats'
import { withResult } from '../utils/result'
import { parseDate } from './utils/time'

/**
 * Record chats for a specific account
 */
async function recordChats(db: CoreDB, chats: CoreDialog[], accountId: string): Promise<DBSelectChat[]> {
  // Use a single transaction so joined_chats and account_joined_chats are consistent
  return db.transaction(async (tx) => {
    // Insert or update joined_chats
    const joinedChats = await tx
      .insert(joinedChatsTable)
      .values(chats.map(chat => ({
        platform: 'telegram',
        chat_id: chat.id.toString(),
        chat_name: chat.name,
        chat_type: chat.type,
        dialog_date: parseDate(chat.lastMessageDate),
      })))
      .onConflictDoUpdate({
        target: joinedChatsTable.chat_id,
        set: {
          chat_name: sql`excluded.chat_name`,
          chat_type: sql`excluded.chat_type`,
          dialog_date: sql`excluded.dialog_date`,
          updated_at: Date.now(),
        },
      })
      .returning()

    // If accountId is provided, automatically link to account_joined_chats
    if (accountId && joinedChats.length > 0) {
      await tx
        .insert(accountJoinedChatsTable)
        .values(joinedChats.map(chat => ({
          account_id: accountId,
          joined_chat_id: chat.id,
        })))
        .onConflictDoNothing()
    }

    return joinedChats
  })
}

/**
 * Fetch all chats
 */
async function fetchChats(db: CoreDB): PromiseResult<DBSelectChat[]> {
  return withResult(() => db.select()
    .from(joinedChatsTable)
    .where(eq(joinedChatsTable.platform, 'telegram'))
    .orderBy(desc(joinedChatsTable.dialog_date)),
  )
}

/**
 * Fetch chats for a specific account
 */
async function fetchChatsByAccountId(db: CoreDB, accountId: string): PromiseResult<DBSelectChat[]> {
  return withResult(() => db
    .select({
      id: joinedChatsTable.id,
      platform: joinedChatsTable.platform,
      chat_id: joinedChatsTable.chat_id,
      chat_name: joinedChatsTable.chat_name,
      chat_type: joinedChatsTable.chat_type,
      dialog_date: joinedChatsTable.dialog_date,
      created_at: joinedChatsTable.created_at,
      updated_at: joinedChatsTable.updated_at,
    })
    .from(joinedChatsTable)
    .innerJoin(
      accountJoinedChatsTable,
      eq(joinedChatsTable.id, accountJoinedChatsTable.joined_chat_id),
    )
    .where(eq(accountJoinedChatsTable.account_id, accountId))
    .orderBy(desc(joinedChatsTable.dialog_date)),
  )
}

/**
 * Check whether a given chat (by Telegram chat_id) is accessible for an account.
 *
 * This is used by higher-level handlers to enforce that message-level access
 * never exceeds the dialogs visible to the account.
 */
async function isChatAccessibleByAccount(db: CoreDB, accountId: string, chatId: string): PromiseResult<boolean> {
  return withResult(async () => {
    const rows = await db
      .select({
        id: joinedChatsTable.id,
      })
      .from(joinedChatsTable)
      .innerJoin(
        accountJoinedChatsTable,
        and(
          eq(accountJoinedChatsTable.joined_chat_id, joinedChatsTable.id),
          eq(accountJoinedChatsTable.account_id, accountId),
        ),
      )
      .where(eq(joinedChatsTable.chat_id, chatId))
      .limit(1)

    return rows.length > 0
  })
}

/**
 * Migrate a Telegram chat ID in the local DB.
 *
 * Why:
 * Telegram can "migrate" a normal group (`Api.Chat`) into a supergroup/channel.
 * In that case, the original chat keeps existing messages, but new messages
 * arrive under a NEW chat id (channel id). If we keep syncing with the old id,
 * incremental sync will appear to "skip" because Telegram no longer appends
 * new messages to the old peer.
 *
 * What this does:
 * - Moves `chat_messages.in_chat_id` from `fromChatId` -> `toChatId` (dedup-safe)
 * - Updates/merges `joined_chats` rows and account links to point to the new id
 *
 * Safety:
 * - Deletes would-be duplicates before updating to avoid unique constraint violations.
 */
async function migrateChatId(
  db: CoreDB,
  params: {
    fromChatId: string
    toChatId: string
    toChatName?: string
    toChatType?: 'user' | 'group' | 'channel'
  },
): PromiseResult<{ movedMessages: number, deletedDuplicates: number, mergedJoinedChats: boolean }> {
  return withResult(async () => {
    const { fromChatId, toChatId, toChatName, toChatType } = params
    if (!fromChatId || !toChatId || fromChatId === toChatId) {
      return { movedMessages: 0, deletedDuplicates: 0, mergedJoinedChats: false }
    }

    return await db.transaction(async (tx) => {
      // Load joined_chats rows (if any)
      const [fromChat] = await tx
        .select()
        .from(joinedChatsTable)
        .where(and(eq(joinedChatsTable.platform, 'telegram'), eq(joinedChatsTable.chat_id, fromChatId)))
        .limit(1)

      const [toChat] = await tx
        .select()
        .from(joinedChatsTable)
        .where(and(eq(joinedChatsTable.platform, 'telegram'), eq(joinedChatsTable.chat_id, toChatId)))
        .limit(1)

      // 1) Delete duplicates that would violate the unique constraint after move.
      // Unique key: (platform, platform_message_id, in_chat_id, owner_account_id) nulls not distinct.
      const deleteDupResult = await tx.execute(sql`
        DELETE FROM ${chatMessagesTable} AS m_old
        USING ${chatMessagesTable} AS m_new
        WHERE m_old.platform = 'telegram'
          AND m_new.platform = 'telegram'
          AND m_old.in_chat_id = ${fromChatId}
          AND m_new.in_chat_id = ${toChatId}
          AND m_old.platform_message_id = m_new.platform_message_id
          AND (m_old.owner_account_id IS NOT DISTINCT FROM m_new.owner_account_id)
      `)
      // drizzle returns driver-specific results; best-effort rowCount
      const deletedDuplicates = Number((deleteDupResult as unknown as { rowCount?: number }).rowCount ?? 0)

      // 2) Move messages
      const movedResult = await tx
        .update(chatMessagesTable)
        .set({
          in_chat_id: toChatId,
          ...(toChatType ? { in_chat_type: toChatType } : {}),
          updated_at: Date.now(),
        })
        .where(and(eq(chatMessagesTable.platform, 'telegram'), eq(chatMessagesTable.in_chat_id, fromChatId)))

      const movedMessages = Number((movedResult as unknown as { rowCount?: number }).rowCount ?? 0)

      // 3) Update/merge joined_chats rows + account links
      let mergedJoinedChats = false

      if (fromChat && !toChat) {
        await tx
          .update(joinedChatsTable)
          .set({
            chat_id: toChatId,
            ...(toChatName ? { chat_name: toChatName } : {}),
            ...(toChatType ? { chat_type: toChatType } : {}),
            updated_at: Date.now(),
          })
          .where(eq(joinedChatsTable.id, fromChat.id))
      }
      else if (fromChat && toChat) {
        mergedJoinedChats = true

        // Move account links from old joined_chat_id -> new joined_chat_id
        await tx.execute(sql`
          UPDATE ${accountJoinedChatsTable}
          SET joined_chat_id = ${toChat.id}
          WHERE joined_chat_id = ${fromChat.id}
        `)

        // Delete old joined_chats row now that links were moved.
        await tx
          .delete(joinedChatsTable)
          .where(eq(joinedChatsTable.id, fromChat.id))

        // Best-effort update of metadata on the destination row
        await tx
          .update(joinedChatsTable)
          .set({
            ...(toChatName ? { chat_name: toChatName } : {}),
            ...(toChatType ? { chat_type: toChatType } : {}),
            updated_at: Date.now(),
          })
          .where(eq(joinedChatsTable.id, toChat.id))
      }
      else if (!fromChat && toChat) {
        // Nothing to do for joined_chats, but still keep metadata fresh if provided.
        await tx
          .update(joinedChatsTable)
          .set({
            ...(toChatName ? { chat_name: toChatName } : {}),
            ...(toChatType ? { chat_type: toChatType } : {}),
            updated_at: Date.now(),
          })
          .where(eq(joinedChatsTable.id, toChat.id))
      }
      // else: neither exists -> message move still happened; joined_chats will be created via dialog bootstrap.

      return { movedMessages, deletedDuplicates, mergedJoinedChats }
    })
  })
}

export const chatModels = {
  recordChats,
  fetchChats,
  fetchChatsByAccountId,
  isChatAccessibleByAccount,
  migrateChatId,
}

export type ChatModels = typeof chatModels
