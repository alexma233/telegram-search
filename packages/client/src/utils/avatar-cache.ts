/**
 * Avatar persistence has been migrated to media binary providers (OSS/OPFS).
 * These stubs keep the previous API surface without using IndexedDB.
 */

type ID = string | number

export interface AvatarCacheRecord {
  scopeId: string
  userId?: string
  chatId?: string
  blob: Blob
  mimeType: string
  fileId?: string
  createdAt: number
  expiresAt: number
}

export async function persistUserAvatar(_userId: string, _blob: Blob, _mimeType: string, _fileId?: string): Promise<void> {
  // No-op: avatars are persisted via MediaBinaryProvider now.
}

export async function persistChatAvatar(_chatId: string | number, _blob: Blob, _mimeType: string, _fileId?: string): Promise<void> {
  // No-op: avatars are persisted via MediaBinaryProvider now.
}

export async function loadUserAvatarFromCache(_userId: ID): Promise<{ url: string, mimeType: string, fileId?: string } | undefined> {
  return undefined
}

export async function loadChatAvatarFromCache(_chatId: ID): Promise<{ url: string, mimeType: string, fileId?: string } | undefined> {
  return undefined
}

export async function evictExpiredOrOversized(_maxBytes?: number): Promise<number> {
  return 0
}

export async function clearAvatarCache(): Promise<void> {}

export async function prefillUserAvatarIntoStore(_userId: ID): Promise<boolean> {
  return false
}

export async function prefillChatAvatarIntoStore(_chatId: ID): Promise<boolean> {
  return false
}
