import type { AnnualReportStats } from '../types/events'

import { bigint, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { accountsTable } from './accounts'

export const annualReportsTable = pgTable('annual_reports', {
  id: uuid().primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull().references(() => accountsTable.id, { onDelete: 'cascade' }),
  year: integer().notNull(),
  status: text().notNull().default('pending'), // pending, processing, completed
  stats: jsonb().$type<AnnualReportStats>(),
  plan: jsonb().$type<any>(), // Store the execution plan
  totalCount: integer().default(0),
  processedCount: integer().default(0),
  updatedAt: bigint({ mode: 'number' }).notNull().$defaultFn(() => Date.now()),
}, table => [
  uniqueIndex('annual_reports_account_id_year_unique_index').on(table.accountId, table.year),
])
