export interface SyncedRange {
  start: number
  end: number
}

/**
 * Build message ID batches for reprocessing based on synced ranges.
 * Uses a simple ascending iteration and stops after `maxMessages` IDs are collected.
 */
export function buildMessageReprocessBatches(
  ranges: SyncedRange[],
  batchSize: number,
  maxMessages?: number,
): number[][] {
  if (!Array.isArray(ranges) || ranges.length === 0)
    return []

  if (batchSize <= 0 || !Number.isInteger(batchSize))
    return []

  const batches: number[][] = []
  let remaining = maxMessages ?? Number.POSITIVE_INFINITY

  for (const range of ranges) {
    const start = Math.min(range.start, range.end)
    const end = Math.max(range.start, range.end)

    for (let current = start; current <= end && remaining > 0; current += batchSize) {
      const batch: number[] = []
      for (let id = current; id <= end && batch.length < batchSize && remaining > 0; id += 1) {
        batch.push(id)
        remaining -= 1
      }

      if (batch.length > 0)
        batches.push(batch)

      if (remaining <= 0)
        break
    }

    if (remaining <= 0)
      break
  }

  return batches
}
