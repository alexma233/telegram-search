// https://github.com/moeru-ai/airi/blob/main/services/telegram-bot/src/models/stickers.ts

import type { CoreTransaction } from '../db'
import type { CoreMessageMediaSticker } from '../types/media'
import type { DBInsertSticker } from './utils/sticker'

import { Ok } from '@unbird/result'
import { eq, sql } from 'drizzle-orm'

import { withDb } from '../db'
import { stickersTable } from '../schemas/stickers'
import { must0 } from './utils/must'

export async function findStickerByFileId(fileId: string) {
  const sticker = (await withDb(db => db
    .select()
    .from(stickersTable)
    .where(eq(stickersTable.file_id, fileId))
    .limit(1),
  )).expect('Failed to find sticker by file ID')

  return Ok(must0(sticker))
}

export async function recordStickers(tx: CoreTransaction, stickers: CoreMessageMediaSticker[]): Promise<DBInsertSticker[]> {
  if (stickers.length === 0) {
    return []
  }

  // Deduplicate the sticker array, using file_id as the unique identifier
  const uniqueStickers = stickers.filter((sticker, index, self) =>
    index === self.findIndex(s => s.platformId === sticker.platformId),
  )

  const dataToInsert = uniqueStickers
    .filter(sticker => sticker.byte != null)
    .map(sticker => ({
      platform: 'telegram',
      file_id: sticker.platformId ?? '',
      sticker_bytes: sticker.byte,
    // TODO: Emoji
    }))

  if (dataToInsert.length === 0) {
    return []
  }

  return tx
    .insert(stickersTable)
    .values(dataToInsert)
    .onConflictDoUpdate({
      target: [stickersTable.platform, stickersTable.file_id],
      set: {
        sticker_bytes: sql`excluded.sticker_bytes`,
        updated_at: Date.now(),
      },
    })
    .returning()
}
