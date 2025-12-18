/* eslint-disable unicorn/prefer-node-protocol */
import type { Logger } from '@guiiai/logg'
import type { Result } from '@unbird/result'
import type { Dialog } from 'telegram/tl/custom/dialog'

import type { MessageResolver, MessageResolverOpts } from '.'
import type { CoreContext } from '../context'
import type { AvatarModels } from '../models/avatars'
import type { AvatarData, AvatarRequest } from '../types/events'
import type { MediaBinaryProvider } from '../types/storage'

import { Buffer } from 'buffer'

import { newQueue } from '@henrygd/queue'
import { Ok } from '@unbird/result'
import { Api } from 'telegram'
import { lru } from 'tiny-lru'
import { v4 as uuidv4 } from 'uuid'

import { AVATAR_CACHE_TTL, AVATAR_DOWNLOAD_CONCURRENCY, MAX_AVATAR_CACHE_SIZE } from '../constants'
import { avatarModels as defaultAvatarModels } from '../models/avatars'

/**
 * Shared avatar cache entry.
 * Stores last `fileId` and `mimeType` for reuse.
 * We no longer store raw bytes in memory to reduce footprint.
 */
interface AvatarCacheEntry {
  fileId?: string
  mimeType?: string
}

/**
 * Per-context singleton store for avatar helper to avoid duplicated instances.
 */
const __avatarHelperSingleton = new WeakMap<CoreContext, ReturnType<typeof createAvatarHelper>>()

type AvatarEntity = Api.User | Api.Chat | Api.Channel

/**
 * Create shared avatar helper bound to a CoreContext.
 * Encapsulates caches and in-flight deduplication for users and dialogs.
 */
function createAvatarHelper(
  ctx: CoreContext,
  logger: Logger,
  avatarModels: AvatarModels,
  mediaBinaryProvider: MediaBinaryProvider | undefined,
) {
  logger = logger.withContext('core:resolver:avatar')

  // Use tiny-lru to implement LRU cache with automatic expiration and eviction
  const userAvatarCache = lru<AvatarCacheEntry>(MAX_AVATAR_CACHE_SIZE, AVATAR_CACHE_TTL)
  const chatAvatarCache = lru<AvatarCacheEntry>(MAX_AVATAR_CACHE_SIZE, AVATAR_CACHE_TTL)
  const dialogEntityCache = lru<AvatarEntity>(MAX_AVATAR_CACHE_SIZE, AVATAR_CACHE_TTL)
  // Negative caches (sentinels): record entities known to have no avatar
  const noUserAvatarCache = lru<boolean>(MAX_AVATAR_CACHE_SIZE, AVATAR_CACHE_TTL)
  const noChatAvatarCache = lru<boolean>(MAX_AVATAR_CACHE_SIZE, AVATAR_CACHE_TTL)

  // In-flight dedup sets
  const inflightUsers = new Set<string>()
  const inflightChats = new Set<string>()

  // Outbox for batching avatar:data events
  let outbox: AvatarData[] = []
  let outboxTimeout: ReturnType<typeof setTimeout> | undefined

  function flushOutbox() {
    if (outbox.length === 0)
      return
    const items = [...outbox]
    outbox = []
    ctx.emitter.emit('avatar:data', { items })
  }

  function queueOutbox(data: AvatarData) {
    outbox.push(data)
    if (!outboxTimeout) {
      outboxTimeout = setTimeout(() => {
        outboxTimeout = undefined
        flushOutbox()
      }, 50)
    }
  }

  /**
   * Normalize id to a string key for caches and dedup.
   * Ensures consistent keys to avoid LRU misses due to type mismatch.
   */
  function toKey(id: string | number | undefined): string | undefined {
    if (id === undefined || id === null)
      return undefined
    const s = String(id)
    return s.length ? s : undefined
  }

  // Concurrency control queue
  const downloadQueue = newQueue(AVATAR_DOWNLOAD_CONCURRENCY)

  function sleep(ms: number) {
    return new Promise<void>(resolve => setTimeout(resolve, ms))
  }

  async function _retryOnce<T>(fn: () => Promise<T | undefined>, backoffMs = 500): Promise<T | undefined> {
    try {
      const r = await fn()
      if (r !== undefined)
        return r
    }
    catch {}
    await sleep(backoffMs)
    try {
      return await fn()
    }
    catch {
      return undefined
    }
  }

  async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
    return await Promise.race([p, new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), ms))])
  }

  function sniffMime(byte: Buffer | Uint8Array | undefined): string {
    if (!byte)
      return 'image/jpeg'
    const b = Buffer.isBuffer(byte) ? byte : Buffer.from(byte)
    if (b.length >= 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47)
      return 'image/png'
    if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF)
      return 'image/jpeg'
    if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP')
      return 'image/webp'
    if (b.length >= 6 && (b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a'))
      return 'image/gif'
    return 'image/jpeg'
  }

  /**
   * Resolve avatar fileId for a Telegram entity.
   * Returns undefined if no photo is present.
   */
  function resolveAvatarFileId(entity: AvatarEntity | undefined): string | undefined {
    try {
      if (!entity)
        return undefined

      if (entity instanceof Api.User && entity.photo && 'photoId' in entity.photo) {
        return (entity.photo as Api.UserProfilePhoto).photoId?.toString()
      }
      else if ((entity instanceof Api.Chat || entity instanceof Api.Channel) && entity.photo && 'photoId' in entity.photo) {
        return (entity.photo as Api.ChatPhoto).photoId?.toString()
      }
    }
    catch {}
    return undefined
  }

  /**
   * Download small profile photo for the given entity.
   * Falls back to `downloadMedia` when `downloadProfilePhoto` fails.
   * Use queue to control concurrency
   */
  async function downloadSmallAvatar(entity: AvatarEntity): Promise<Buffer | undefined> {
    return downloadQueue.add(async () => {
      let buffer: Buffer | Uint8Array | undefined
      try {
        buffer = await withTimeout(ctx.getClient().downloadProfilePhoto(entity, { isBig: false }) as Promise<Buffer>, 5000)
      }
      catch (err) {
        logger.withError(err as Error).debug('downloadProfilePhoto failed, trying fallback')
      }
      if (!buffer) {
        const photo = (entity as Record<string, any>).photo
        if (photo) {
          try {
            buffer = await withTimeout(ctx.getClient().downloadMedia(photo, { thumb: -1 }) as Promise<Buffer>, 5000)
          }
          catch (err2) {
            logger.withError(err2 as Error).debug('downloadMedia fallback failed')
          }
          if (!buffer) {
            // One backoff retry on fallback path
            buffer = await _retryOnce(async () => {
              try {
                const b = await withTimeout(ctx.getClient().downloadMedia(photo, { thumb: -1 }) as Promise<Buffer>, 5000)
                return b ?? undefined
              }
              catch {
                return undefined
              }
            }, 500)
          }
        }
      }
      if (!buffer)
        return undefined
      return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
    })
  }

  function applyAvatarResult(
    kind: 'user' | 'chat',
    key: string,
    _idRaw: string | number,
    fileId: string | undefined,
    cache: ReturnType<typeof lru<AvatarCacheEntry>>,
    negativeCache: ReturnType<typeof lru<boolean>>,
    result: { mimeType: string },
  ) {
    cache.set(key, { fileId, mimeType: result.mimeType })

    if (negativeCache.get(key))
      negativeCache.delete(key)

    queueOutbox({ kind, id: key, mimeType: result.mimeType, fileId })
  }

  async function loadAvatarFromStorage(
    kind: 'user' | 'chat',
    key: string,
    expectedFileId?: string,
  ): Promise<{ mimeType: string, fileId?: string } | undefined> {
    try {
      const record = (await avatarModels.findAvatarByEntity(ctx.getDB(), kind, key)).orUndefined()
      if (!record)
        return undefined
      if (expectedFileId && record.file_id && expectedFileId !== record.file_id)
        return undefined

      const mimeType = record.mime_type || 'image/jpeg'
      return { mimeType, fileId: record.file_id || undefined }
    }
    catch (error) {
      logger.withError(error as Error).debug('Failed to load avatar from storage')
    }
    return undefined
  }

  async function persistAvatar(
    kind: 'user' | 'chat',
    key: string,
    fileId: string | undefined,
    result: { byte: Buffer, mimeType: string },
  ) {
    try {
      const db = ctx.getDB()
      let storagePath: string | undefined

      if (mediaBinaryProvider) {
        const location = await mediaBinaryProvider.save(
          { uuid: uuidv4(), kind: 'avatar' },
          new Uint8Array(result.byte),
          result.mimeType,
        )
        storagePath = location.path
      }

      await avatarModels.upsertAvatar(db, {
        entityId: key,
        entityType: kind,
        fileId,
        mimeType: result.mimeType,
        storagePath,
        byte: storagePath ? undefined : result.byte,
      })
    }
    catch (error) {
      logger.withError(error as Error).debug('Failed to persist avatar to storage')
    }
  }

  /**
   * Generic avatar fetcher for user/chat with caches, in-flight dedup, and emission.
   */
  async function fetchAvatarCore(
    kind: 'user' | 'chat',
    idRaw: string | number,
    opts: { expectedFileId?: string, entityOverride?: AvatarEntity } = {},
  ): Promise<void> {
    const isUser = kind === 'user'
    const idLabel = isUser ? 'userId' : 'chatId'
    const key = toKey(idRaw)
    if (!key) {
      logger.withFields({ [idLabel]: idRaw }).verbose(`Invalid ${idLabel}; skip fetch`)
      return
    }

    const inflight = isUser ? inflightUsers : inflightChats
    const negative = isUser ? noUserAvatarCache : noChatAvatarCache
    const cache = isUser ? userAvatarCache : chatAvatarCache

    try {
      if (negative.get(key)) {
        logger.withFields({ [idLabel]: key }).verbose(`${isUser ? 'User' : 'Chat'} has no avatar (sentinel); skip fetch`)
        return
      }
      if (inflight.has(key))
        return
      inflight.add(key)

      // Early cache validation only for user when expectedFileId provided
      if (isUser && opts.expectedFileId) {
        const cachedEarly = cache.get(key)
        logger.withFields({ userId: key, expectedFileId: opts.expectedFileId, cachedFileId: cachedEarly?.fileId }).verbose('User avatar early cache validation')
        if (cachedEarly && cachedEarly.fileId === opts.expectedFileId && cachedEarly.mimeType) {
          queueOutbox({ kind: 'user', id: key, mimeType: cachedEarly.mimeType, fileId: opts.expectedFileId })
          return
        }
      }
      else if (isUser) {
        logger.withFields({ userId: key }).verbose('No expectedFileId provided for early cache validation')
      }

      const stored = await loadAvatarFromStorage(kind, key, opts.expectedFileId)
      if (stored) {
        applyAvatarResult(kind, key, idRaw, stored.fileId ?? opts.expectedFileId, cache, negative, stored)
        return
      }

      let entity: AvatarEntity | undefined
      if (isUser) {
        entity = await ctx.getClient().getEntity(String(idRaw)) as Api.User
      }
      else {
        entity = opts.entityOverride ?? dialogEntityCache.get(key)
        if (!entity) {
          entity = await ctx.getClient().getEntity(String(idRaw)) as AvatarEntity
          try {
            if (entity && (entity as any).id)

              dialogEntityCache.set(String((entity as any).id.toJSNumber?.() ?? (entity as any).id), entity)
          }
          catch {}
        }
      }
      if (!entity)
        return

      const fileId = resolveAvatarFileId(entity)
      if (isUser)
        logger.withFields({ userId: key, resolvedFileId: fileId }).verbose('Resolved fileId from entity')

      const cached = cache.get(key)
      if (cached && cached.mimeType && ((fileId && cached.fileId === fileId) || !fileId)) {
        applyAvatarResult(kind, key, idRaw, fileId, cache, negative, { mimeType: cached.mimeType })
        return
      }

      const byte = await downloadSmallAvatar(entity)
      if (!byte) {
        if (!fileId) {
          negative.set(key, true)
          logger.withFields({ [idLabel]: isUser ? key : idRaw }).verbose(`${isUser ? 'User' : 'Chat'} has no avatar; record sentinel and skip`)
        }
        else {
          logger.withFields({ [idLabel]: isUser ? key : idRaw }).verbose(`${isUser ? 'No avatar available for user' : 'No avatar available for single dialog fetch'}`)
        }
        return
      }

      const mimeType = sniffMime(byte)
      const result = { byte, mimeType }
      await persistAvatar(kind, key, fileId, result)
      applyAvatarResult(kind, key, idRaw, fileId, cache, negative, result)
    }
    catch (error) {
      logger.withError(error as Error).warn(isUser ? 'Failed to fetch avatar for user' : 'Failed to fetch single avatar for dialog')
    }
    finally {
      const inflight2 = isUser ? inflightUsers : inflightChats
      inflight2.delete(key)
    }
  }

  async function fetchUserAvatar(userId: string, expectedFileId?: string): Promise<void> {
    await fetchAvatarCore('user', userId, { expectedFileId })
  }

  async function fetchDialogAvatar(chatId: string | number, opts: { entityOverride?: AvatarEntity } = {}): Promise<void> {
    await fetchAvatarCore('chat', chatId, { entityOverride: opts.entityOverride })
  }

  async function fetchAvatars(items: AvatarRequest[]): Promise<void> {
    // Process items in parallel
    // fetchAvatarCore manages internal concurrency via downloadQueue, so it's safe to fire them all.
    await Promise.allSettled(items.map(item => fetchAvatarCore(item.kind, item.id, { expectedFileId: item.fileId })))
  }

  /**
   * Prime avatar cache helper used by both user and chat variants.
   * Inserts a placeholder cache entry with `fileId` when bytes are not present.
   */
  function primeAvatarCache(
    cache: ReturnType<typeof lru<AvatarCacheEntry>>,
    kind: 'user' | 'chat',
    idLabel: 'userId' | 'chatId',
    id: string,
    fileId: string,
    logInvalid: boolean,
  ) {
    const key = toKey(id)
    if (!key) {
      if (logInvalid)
        logger.withFields({ [idLabel]: id }).verbose(`Invalid ${idLabel} for priming; skip`)
      return
    }
    const existing = cache.get(key)
    if (!existing) {
      logger.withFields({ [idLabel]: key, fileId }).debug(`Priming ${kind} avatar cache with fileId`)
      cache.set(key, { fileId, mimeType: '' })
    }
  }

  function primeUserAvatarCacheCore(userId: string, fileId: string) {
    primeAvatarCache(userAvatarCache, 'user', 'userId', userId, fileId, true)
  }

  function primeChatAvatarCacheCore(chatId: string, fileId: string) {
    primeAvatarCache(chatAvatarCache, 'chat', 'chatId', chatId, fileId, false)
  }

  /**
   * Batch fetch avatars for a list of dialogs.
   * Concurrency is governed exclusively by the internal `downloadQueue`.
   * This avoids a "queue of queues" situation and ensures steady throughput.
   */
  async function fetchDialogAvatars(dialogList: Dialog[]): Promise<void> {
    const total = dialogList.length
    if (total === 0)
      return

    // Create one task per dialog. Each task delegates concurrency to downloadQueue.
    const tasks = dialogList.map(async (dialog) => {
      if (!dialog?.entity)
        return

      try {
        const id = dialog.entity.id?.toJSNumber?.()
        if (!id)
          return
        const key = toKey(id)!

        // Early skip if sentinel says no avatar
        if (noChatAvatarCache.get(key)) {
          logger.withFields({ chatId: id }).verbose('Chat has no avatar (sentinel); skip batch fetch')
          return
        }

        const fileId = resolveAvatarFileId(dialog.entity as AvatarEntity)
        const cached = chatAvatarCache.get(key)
        if (cached && cached.mimeType && ((fileId && cached.fileId === fileId) || !fileId))
          return

        const stored = await loadAvatarFromStorage('chat', key)
        if (stored) {
          applyAvatarResult('chat', key, id, stored.fileId, chatAvatarCache, noChatAvatarCache, stored)
          return
        }

        // Delegates concurrency via global downloadQueue
        const byte = await downloadSmallAvatar(dialog.entity as AvatarEntity)
        if (!byte) {
          if (!fileId) {
            noChatAvatarCache.set(key, true)
            logger.withFields({ chatId: id }).verbose('Chat has no avatar; record sentinel and skip batch fetch')
          }
          else {
            logger.withFields({ chatId: id }).verbose('No avatar available for dialog')
          }
          return
        }

        const mimeType = sniffMime(byte)
        const result = { byte, mimeType }
        await persistAvatar('chat', key, fileId, result)
        applyAvatarResult('chat', key, id, fileId, chatAvatarCache, noChatAvatarCache, result)
      }
      catch (error) {
        logger.withError(error as Error).warn('Failed to fetch avatar for dialog')
      }
    })

    // Wait for all tasks to settle; errors are logged per-task
    await Promise.allSettled(tasks)
  }

  return {
    fetchUserAvatar,
    fetchDialogAvatar,
    fetchDialogAvatars,
    fetchAvatars, // Exported new batch method
    dialogEntityCache,
    primeUserAvatarCache: primeUserAvatarCacheCore,
    primeChatAvatarCache: primeChatAvatarCacheCore,
    // Export cleanup method for external invocation
    clearCache: () => {
      userAvatarCache.clear()
      chatAvatarCache.clear()
      dialogEntityCache.clear()
      noUserAvatarCache.clear()
      noChatAvatarCache.clear()
      logger.log('Avatar cache manually cleared')
    },
    getCacheStats: () => ({
      userAvatars: userAvatarCache.size,
      chatAvatars: chatAvatarCache.size,
      entities: dialogEntityCache.size,
      noUserAvatars: noUserAvatarCache.size,
      noChatAvatars: noChatAvatarCache.size,
      maxSize: MAX_AVATAR_CACHE_SIZE,
      ttl: `${AVATAR_CACHE_TTL / 1000}s`,
    }),
    primeUserAvatarCacheBatch: (list: Array<{ userId: string, fileId: string }>) => {
      for (const { userId, fileId } of list)
        primeUserAvatarCacheCore(userId, fileId)
    },
    primeChatAvatarCacheBatch: (list: Array<{ chatId: string, fileId: string }>) => {
      for (const { chatId, fileId } of list)
        primeChatAvatarCacheCore(chatId, fileId)
    },
  }
}

/**
 * Get or create a shared avatar helper instance bound to the provided context.
 */
export function useAvatarHelper(
  ctx: CoreContext,
  logger: Logger,
  avatarModels?: AvatarModels,
  mediaBinaryProvider?: MediaBinaryProvider,
) {
  let helper = __avatarHelperSingleton.get(ctx)
  if (!helper) {
    const modelRef = avatarModels ?? defaultAvatarModels
    helper = createAvatarHelper(ctx, logger, modelRef, mediaBinaryProvider)
    __avatarHelperSingleton.set(ctx, helper)
  }
  return helper
}

/**
 * Create AvatarResolver for message pipeline.
 * For each message, opportunistically fetch sender's avatar.
 * Returns no message mutations (Ok([])) to avoid duplicate storage writes.
 */
export function createAvatarResolver(
  ctx: CoreContext,
  logger: Logger,
  avatarModels: AvatarModels,
  mediaBinaryProvider: MediaBinaryProvider | undefined,
): MessageResolver {
  logger = logger.withContext('core:resolver:avatar')

  const helper = useAvatarHelper(ctx, logger, avatarModels, mediaBinaryProvider)

  return {
    /**
     * Process messages and ensure user avatars are fetched lazily.
     */
    run: async (opts: MessageResolverOpts): Promise<Result<never[]>> => {
      logger.verbose('Executing avatar resolver')

      // Deduplicate by sender id to avoid repeated downloads within the same batch
      const uniqueUserIds = Array.from(new Set(opts.messages.map(m => String(m.fromId)).filter(Boolean)))

      // Use concurrency control to avoid downloading too many avatars simultaneously
      // fetchUserAvatar internally controls concurrency through downloadQueue
      await Promise.all(uniqueUserIds.map(id => helper.fetchUserAvatar(id)))

      // Log cache stats (for debugging)
      const stats = helper.getCacheStats()
      logger.debug('Avatar cache stats', stats)

      // No message mutations to persist
      return Ok([] as never[])
    },
  }
}
