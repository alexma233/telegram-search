import type { CoreDB } from '../db'
import type { AnnualReportStats } from '../types/events'
import type { PromiseResult } from '../utils/result'

import { and, eq } from 'drizzle-orm'

import { annualReportsTable } from '../schemas/annual-reports'
import { withResult } from '../utils/result'

async function upsertReport(
  db: CoreDB,
  accountId: string,
  year: number,
  data: {
    status?: string
    stats?: AnnualReportStats
    plan?: any
    totalCount?: number
    processedCount?: number
  },
) {
  return await db
    .insert(annualReportsTable)
    .values({
      accountId,
      year,
      ...data,
      updatedAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: [annualReportsTable.accountId, annualReportsTable.year],
      set: {
        ...data,
        updatedAt: Date.now(),
      },
    })
    .returning()
}

async function findReport(db: CoreDB, accountId: string, year: number): PromiseResult<any> {
  return withResult(async () => {
    const rows = await db
      .select()
      .from(annualReportsTable)
      .where(and(
        eq(annualReportsTable.accountId, accountId),
        eq(annualReportsTable.year, year),
      ))
      .limit(1)
    return rows[0]
  })
}

async function updateProgress(db: CoreDB, accountId: string, year: number, processedCount: number, totalCount: number) {
  return await db
    .update(annualReportsTable)
    .set({
      processedCount,
      totalCount,
      status: 'processing',
      updatedAt: Date.now(),
    })
    .where(and(
      eq(annualReportsTable.accountId, accountId),
      eq(annualReportsTable.year, year),
    ))
}

export const annualReportModels = {
  upsertReport,
  findReport,
  updateProgress,
}

export type AnnualReportModels = typeof annualReportModels
