import { bigint, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'

export const tasksTable = pgTable('tasks', {
  id: uuid().primaryKey().defaultRandom(),
  task_id: text().notNull().unique(),
  type: text().notNull().$type<'takeout' | 'getMessage' | 'embed'>(),
  status: text().notNull().default('pending').$type<'pending' | 'running' | 'completed' | 'failed' | 'aborted'>(),
  progress: bigint({ mode: 'number' }).notNull().default(0),
  last_message: text(),
  last_error: text(),
  metadata: jsonb().notNull().default({}),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  completed_at: bigint({ mode: 'number' }),
}, table => [
  index('tasks_task_id_index').on(table.task_id),
  index('tasks_status_index').on(table.status),
  index('tasks_type_index').on(table.type),
  index('tasks_created_at_index').on(table.created_at),
])
