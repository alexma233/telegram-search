import type { AccountSettings } from '../types/account-settings'

import { bigint, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { generateDefaultAccountSettings } from '../utils/account-settings'

export const accountsTable = pgTable('accounts', {
  id: uuid().primaryKey().defaultRandom(),
  platform: text().notNull().default('telegram'),
  platform_user_id: text().notNull().default(''),
  settings: jsonb().$type<AccountSettings>().default(generateDefaultAccountSettings()),

  // Telegram State Machine (PTS/QTS)
  pts: integer().notNull().default(0),
  qts: integer().notNull().default(0),
  seq: integer().notNull().default(0),
  date: integer().notNull().default(0),

  last_sync_at: bigint({ mode: 'number' }).notNull().default(0),

  created_at: bigint({ mode: 'number' }).notNull().$defaultFn(() => Date.now()),
  updated_at: bigint({ mode: 'number' }).notNull().$defaultFn(() => Date.now()),
}, table => [
  uniqueIndex('accounts_platform_platform_user_id_unique_index').on(table.platform, table.platform_user_id),
])
