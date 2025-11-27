import { bigint, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const usersTable = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  platform: text().notNull().default('telegram'),
  platform_user_id: text().notNull().default(''),
  name: text().notNull().default(''),
  username: text().notNull().default(''),
  type: text().notNull().default('user').$type<'user' | 'chat' | 'channel'>(),
  // Avatar file ID from Telegram (photoId). Used to detect avatar changes.
  avatar_file_id: text(),
  // Avatar data stored as base64-encoded string. Null if no avatar or not yet fetched.
  avatar_base64: text(),
  // Avatar MIME type (e.g., 'image/jpeg', 'image/png')
  avatar_mime_type: text(),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
}, table => [
  uniqueIndex('users_platform_platform_user_id_unique_index').on(table.platform, table.platform_user_id),
  index('users_platform_user_id_index').on(table.platform_user_id),
])
