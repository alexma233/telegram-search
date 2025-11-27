import type { Buffer } from 'buffer'

import type { CoreEntity } from '../types/events'

import { and, eq, sql } from 'drizzle-orm'

import { withDb } from '../db'
import { usersTable } from '../schemas/users'

export type DBInsertUser = typeof usersTable.$inferInsert
export type DBSelectUser = typeof usersTable.$inferSelect

/**
 * Record or update a user in the database
 */
export async function recordUser(user: CoreEntity) {
  const dbUser: DBInsertUser = {
    platform: 'telegram',
    platform_user_id: user.id,
    name: user.name,
    username: 'username' in user ? user.username : user.id,
    type: user.type,
  }

  return withDb(async db => db
    .insert(usersTable)
    .values(dbUser)
    .onConflictDoUpdate({
      target: [usersTable.platform, usersTable.platform_user_id],
      set: {
        name: sql`excluded.name`,
        username: sql`excluded.username`,
        type: sql`excluded.type`,
        updated_at: Date.now(),
      },
    })
    .returning(),
  )
}

/**
 * Find a user by platform and platform_user_id
 */
export async function findUserByPlatformId(platform: string, platformUserId: string) {
  return withDb(async (db) => {
    const results = await db
      .select()
      .from(usersTable)
      .where(and(
        eq(usersTable.platform, platform),
        eq(usersTable.platform_user_id, platformUserId),
      ))
      .limit(1)

    return results.length > 0 ? results[0] : null
  })
}

/**
 * Find a user by UUID
 */
export async function findUserByUUID(uuid: string) {
  return withDb(async (db) => {
    const results = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, uuid))
      .limit(1)

    return results[0] || null
  })
}

/**
 * Convert CoreEntity to a format suitable for database insertion
 */
export function convertCoreEntityToDBUser(entity: CoreEntity): DBInsertUser {
  return {
    platform: 'telegram',
    platform_user_id: entity.id,
    name: entity.name,
    username: 'username' in entity ? entity.username : entity.id,
    type: entity.type,
  }
}

/**
 * Convert DBSelectUser back to CoreEntity
 */
export function convertDBUserToCoreEntity(dbUser: DBSelectUser): CoreEntity {
  if (dbUser.type === 'user') {
    return {
      type: 'user',
      id: dbUser.platform_user_id,
      name: dbUser.name,
      username: dbUser.username,
    }
  }
  else if (dbUser.type === 'chat') {
    return {
      type: 'chat',
      id: dbUser.platform_user_id,
      name: dbUser.name,
    }
  }
  else {
    return {
      type: 'channel',
      id: dbUser.platform_user_id,
      name: dbUser.name,
    }
  }
}

/**
 * Avatar data structure for database storage
 */
export interface UserAvatarData {
  fileId: string
  bytes: Buffer
}

/**
 * Update a user's avatar in the database
 * @param platformUserId The Telegram user ID
 * @param avatarData The avatar data to store (fileId and raw bytes)
 */
export async function updateUserAvatar(platformUserId: string, avatarData: UserAvatarData) {
  return withDb(async db => db
    .update(usersTable)
    .set({
      avatar_file_id: avatarData.fileId,
      avatar_bytes: avatarData.bytes,
      updated_at: Date.now(),
    })
    .where(and(
      eq(usersTable.platform, 'telegram'),
      eq(usersTable.platform_user_id, platformUserId),
    ))
    .returning(),
  )
}

/**
 * Get a user's avatar from the database
 * @param platformUserId The Telegram user ID
 * @returns Avatar data or null if not found
 */
export async function getUserAvatar(platformUserId: string): Promise<UserAvatarData | null> {
  return withDb(async (db) => {
    const results = await db
      .select({
        avatar_file_id: usersTable.avatar_file_id,
        avatar_bytes: usersTable.avatar_bytes,
      })
      .from(usersTable)
      .where(and(
        eq(usersTable.platform, 'telegram'),
        eq(usersTable.platform_user_id, platformUserId),
      ))
      .limit(1)

    const record = results[0]
    // Return null if record doesn't exist or avatar fields are missing
    if (!record?.avatar_file_id || !record.avatar_bytes)
      return null

    return {
      fileId: record.avatar_file_id,
      bytes: record.avatar_bytes,
    }
  })
}
