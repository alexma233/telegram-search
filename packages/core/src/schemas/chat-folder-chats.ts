import { bigint, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { chatFoldersTable } from './chat-folders'
import { joinedChatsTable } from './joined-chats'

export const chatFolderChatsTable = pgTable('chat_folder_chats', {
  id: uuid().primaryKey().defaultRandom(),
  chat_folder_id: uuid().notNull().references(() => chatFoldersTable.id, { onDelete: 'cascade' }),
  joined_chat_id: uuid().notNull().references(() => joinedChatsTable.id, { onDelete: 'cascade' }),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
}, table => [
  uniqueIndex('chat_folder_chats_folder_chat_unique_index').on(table.chat_folder_id, table.joined_chat_id),
])
