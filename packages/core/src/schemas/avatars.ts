import { bigint, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { bytea } from './utils/type'

export const avatarsTable = pgTable('avatars', {
  id: uuid().primaryKey().defaultRandom(),
  platform: text().notNull().default('telegram'),
  entity_type: text().notNull().default(''),
  entity_id: text().notNull().default(''),
  file_id: text().notNull().default(''),
  avatar_bytes: bytea(),
  storage_path: text().notNull().default(''),
  mime_type: text().notNull().default(''),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
}, table => [
  uniqueIndex('avatars_entity_unique_index').on(table.platform, table.entity_type, table.entity_id),
  index('avatars_file_id_index').on(table.file_id),
])
