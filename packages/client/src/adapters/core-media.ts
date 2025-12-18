import type {
  CoreMessageMediaFromBlob,
  MediaBinaryLocation,
  MediaBinaryProvider,
  PhotoModels,
  StickerModels,
} from '@tg-search/core'

import { useLogger } from '@guiiai/logg'
import { avatarModels } from '@tg-search/core'

import { API_BASE } from '../../constants'
import { bytesToBlob } from '../utils/image'
import { getDB } from './core-db'

export async function hydrateMediaBlobWithCore(
  media: CoreMessageMediaFromBlob,
  photoModels: PhotoModels,
  stickerModels: StickerModels,
  mediaBinaryProvider: MediaBinaryProvider | undefined,
): Promise<void> {
  const logger = useLogger('MediaWithCore')

  if (!media.queryId) {
    return
  }

  const db = getDB()

  try {
    if (media.type === 'photo') {
      const photo = (await photoModels.findPhotoByQueryId(db, media.queryId)).orUndefined()

      let bytes: Uint8Array | undefined

      if (mediaBinaryProvider && photo?.image_path) {
        const location: MediaBinaryLocation = {
          kind: 'photo',
          path: photo.image_path,
        }
        bytes = await mediaBinaryProvider.load(location) ?? undefined
      }
      else if (photo?.image_bytes) {
        bytes = new Uint8Array(photo.image_bytes as unknown as ArrayBufferLike)
      }

      if (!bytes) {
        return
      }

      const mimeType = photo?.image_mime_type || media.mimeType || 'application/octet-stream'
      const blob = bytesToBlob(bytes, mimeType)
      const url = URL.createObjectURL(blob)

      media.blobUrl = url

      logger.debug('Hydrated photo blob in With Core mode', { queryId: media.queryId })
      return
    }

    if (media.type === 'sticker') {
      const sticker = (await stickerModels.findStickerByQueryId(db, media.queryId)).orUndefined()

      let bytes: Uint8Array | undefined

      if (mediaBinaryProvider && sticker?.sticker_path) {
        const location: MediaBinaryLocation = {
          kind: 'sticker',
          path: sticker.sticker_path,
        }
        bytes = await mediaBinaryProvider.load(location) ?? undefined
      }
      else if (sticker?.sticker_bytes) {
        bytes = new Uint8Array(sticker.sticker_bytes as unknown as ArrayBufferLike)
      }

      if (!bytes) {
        return
      }

      const mimeType = sticker?.sticker_mime_type || media.mimeType || 'application/octet-stream'
      const blob = bytesToBlob(bytes, mimeType)
      const url = URL.createObjectURL(blob)

      media.blobUrl = url

      logger.debug('Hydrated sticker blob in With Core mode', { queryId: media.queryId })
    }
  }
  catch (error) {
    logger.withError(error).warn('Failed to hydrate media blob in With Core mode')
  }
}

/**
 * Load avatar data (blob URL) from core.
 * - Browser Mode: Queries local DB and OPFS/Storage.
 * - Server Mode: Constructs API URL.
 */
export async function loadAvatarWithCore(
  kind: 'user' | 'chat',
  id: string,
  fileId?: string,
  mediaBinaryProvider?: MediaBinaryProvider,
): Promise<{ blobUrl: string, mimeType: string, fileId?: string } | undefined> {
  let db
  try {
    db = getDB()
  }
  catch {
    // Server Mode: Database not initialized on client
    if (!fileId)
      return undefined

    return {
      blobUrl: `${API_BASE}/v1/avatars/${fileId}`,
      mimeType: 'image/jpeg',
      fileId,
    }
  }

  // Browser Mode: DB is available
  if (!db)
    return undefined

  try {
    // 1. Query avatar record from DB
    const record = (await avatarModels.findAvatarByEntity(db, kind, id)).orUndefined()
    if (!record)
      return undefined

    // 2. Validate fileId if provided
    if (fileId && record.file_id && record.file_id !== fileId)
      return undefined

    const mimeType = record.mime_type || 'image/jpeg'
    let bytes: Uint8Array | undefined

    // 3. Load bytes from Storage (OPFS) or DB inline bytes
    if (mediaBinaryProvider && record.storage_path) {
      const location: MediaBinaryLocation = {
        kind: 'avatar',
        path: record.storage_path,
      }
      bytes = await mediaBinaryProvider.load(location) ?? undefined
    }
    else if (record.avatar_bytes) {
      bytes = new Uint8Array(record.avatar_bytes as unknown as ArrayBufferLike)
    }

    if (!bytes)
      return undefined

    // 4. Create Blob URL
    const blob = bytesToBlob(bytes, mimeType)
    const blobUrl = URL.createObjectURL(blob)

    return {
      blobUrl,
      mimeType,
      fileId: record.file_id || undefined,
    }
  }
  catch (error) {
    useLogger('MediaWithCore').withError(error).warn('Failed to load avatar from core', { kind, id })
    return undefined
  }
}
