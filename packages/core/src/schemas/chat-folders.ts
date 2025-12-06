import { bigint, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { accountsTable } from './accounts'

export const chatFoldersTable = pgTable('chat_folders', {
  id: uuid().primaryKey().defaultRandom(),
  account_id: uuid().notNull().references(() => accountsTable.id, { onDelete: 'cascade' }),
  telegram_folder_id: integer().notNull(),
  title: text().notNull().default(''),
  emoticon: text(),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
}, table => [
  uniqueIndex('chat_folders_account_folder_unique_index').on(table.account_id, table.telegram_folder_id),
])
