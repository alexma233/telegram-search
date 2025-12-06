import type { CoreDialogFolder } from '../types/dialog'

import { eq, inArray } from 'drizzle-orm'

import { withDb } from '../db'
import { chatFolderChatsTable } from '../schemas/chat-folder-chats'
import { chatFoldersTable } from '../schemas/chat-folders'
import { joinedChatsTable } from '../schemas/joined-chats'

export async function recordDialogFolders(accountId: string, folders: CoreDialogFolder[]) {
  return withDb(async (db) => {
    return db.transaction(async (tx) => {
      await tx.delete(chatFoldersTable).where(eq(chatFoldersTable.account_id, accountId))

      if (folders.length === 0)
        return []

      const insertedFolders = await tx.insert(chatFoldersTable)
        .values(folders.map(folder => ({
          account_id: accountId,
          telegram_folder_id: folder.id,
          title: folder.title,
          emoticon: folder.emoticon,
        })))
        .returning()

      const folderIdByTelegramId = new Map<number, string>()
      insertedFolders.forEach((folder) => {
        folderIdByTelegramId.set(folder.telegram_folder_id, folder.id)
      })

      const chatIds = Array.from(new Set(folders.flatMap(folder => folder.chatIds.map(id => id.toString()))))
      if (chatIds.length === 0)
        return insertedFolders

      const joinedChats = await tx.select({
        id: joinedChatsTable.id,
        chat_id: joinedChatsTable.chat_id,
      })
        .from(joinedChatsTable)
        .where(inArray(joinedChatsTable.chat_id, chatIds))

      const joinedChatIdByChatId = new Map(joinedChats.map(chat => [chat.chat_id, chat.id] as const))

      const folderChatValues: Array<{ chat_folder_id: string, joined_chat_id: string }> = []
      for (const folder of folders) {
        const folderRowId = folderIdByTelegramId.get(folder.id)
        if (!folderRowId)
          continue

        for (const chatId of folder.chatIds) {
          const joinedChatId = joinedChatIdByChatId.get(chatId.toString())
          if (!joinedChatId)
            continue

          folderChatValues.push({
            chat_folder_id: folderRowId,
            joined_chat_id: joinedChatId,
          })
        }
      }

      if (folderChatValues.length > 0) {
        await tx.insert(chatFolderChatsTable)
          .values(folderChatValues)
          .onConflictDoNothing()
      }

      return insertedFolders
    })
  })
}

export async function fetchDialogFoldersByAccountId(accountId: string) {
  return withDb(async (db) => {
    const rows = await db
      .select({
        folderId: chatFoldersTable.id,
        telegramFolderId: chatFoldersTable.telegram_folder_id,
        title: chatFoldersTable.title,
        emoticon: chatFoldersTable.emoticon,
        chatId: joinedChatsTable.chat_id,
      })
      .from(chatFoldersTable)
      .leftJoin(chatFolderChatsTable, eq(chatFoldersTable.id, chatFolderChatsTable.chat_folder_id))
      .leftJoin(joinedChatsTable, eq(chatFolderChatsTable.joined_chat_id, joinedChatsTable.id))
      .where(eq(chatFoldersTable.account_id, accountId))

    const foldersMap = new Map<number, { title: string, emoticon?: string | null, chatIds: Set<number> }>()

    for (const row of rows) {
      if (!foldersMap.has(row.telegramFolderId)) {
        foldersMap.set(row.telegramFolderId, {
          title: row.title,
          emoticon: row.emoticon,
          chatIds: new Set<number>(),
        })
      }

      if (row.chatId) {
        const numericId = Number(row.chatId)
        if (!Number.isNaN(numericId))
          foldersMap.get(row.telegramFolderId)?.chatIds.add(numericId)
      }
    }

    return Array.from(foldersMap.entries()).map(([id, value]) => ({
      id,
      title: value.title,
      emoticon: value.emoticon ?? undefined,
      chatIds: Array.from(value.chatIds),
    })) satisfies CoreDialogFolder[]
  })
}
