// eslint-disable-next-line unicorn/prefer-node-protocol
import type { Buffer } from 'buffer'

import type { CoreDB } from '../db'
import type { PromiseResult } from '../utils/result'
import type { DBInsertAvatar, DBSelectAvatar } from './utils/types'

import { and, eq, sql } from 'drizzle-orm'

import { avatarsTable } from '../schemas/avatars'
import { withResult } from '../utils/result'
import { must0 } from './utils/must'

type AvatarEntityType = 'user' | 'chat'

export interface AvatarRecordForUpsert {
  entityId: string
  entityType: AvatarEntityType
  fileId?: string
  mimeType?: string
  storagePath?: string
  byte?: Buffer
}

async function upsertAvatar(db: CoreDB, avatar: AvatarRecordForUpsert): Promise<DBInsertAvatar[]> {
  const dataToInsert: DBInsertAvatar = {
    platform: 'telegram',
    entity_type: avatar.entityType,
    entity_id: avatar.entityId,
    file_id: avatar.fileId ?? '',
    mime_type: avatar.mimeType ?? '',
    storage_path: avatar.storagePath ?? '',
    avatar_bytes: avatar.storagePath ? undefined : avatar.byte,
  }

  return db
    .insert(avatarsTable)
    .values(dataToInsert)
    .onConflictDoUpdate({
      target: [avatarsTable.platform, avatarsTable.entity_type, avatarsTable.entity_id],
      set: {
        file_id: sql`excluded.file_id`,
        mime_type: sql`excluded.mime_type`,
        storage_path: sql`excluded.storage_path`,
        avatar_bytes: sql`excluded.avatar_bytes`,
        updated_at: Date.now(),
      },
    })
    .returning()
}

async function findAvatarByEntity(
  db: CoreDB,
  entityType: AvatarEntityType,
  entityId: string,
): PromiseResult<DBSelectAvatar> {
  return withResult(async () => {
    const avatars = await db
      .select()
      .from(avatarsTable)
      .where(
        and(
          eq(avatarsTable.platform, 'telegram'),
          eq(avatarsTable.entity_type, entityType),
          eq(avatarsTable.entity_id, entityId),
        ),
      )
      .limit(1)

    return must0(avatars)
  })
}

async function findAvatarByFileId(db: CoreDB, fileId: string): PromiseResult<DBSelectAvatar> {
  return withResult(async () => {
    const avatars = await db
      .select()
      .from(avatarsTable)
      .where(
        and(
          eq(avatarsTable.platform, 'telegram'),
          eq(avatarsTable.file_id, fileId),
        ),
      )
      .limit(1)

    return must0(avatars)
  })
}

export const avatarModels = {
  upsertAvatar,
  findAvatarByEntity,
  findAvatarByFileId,
}

export type AvatarModels = typeof avatarModels
