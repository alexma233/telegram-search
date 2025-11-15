import type { stickersTable } from '../../schemas/stickers'

export type DBInsertSticker = typeof stickersTable.$inferInsert
export type DBSelectSticker = typeof stickersTable.$inferSelect
