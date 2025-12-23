import type { Entity, EntityLike } from 'telegram/define'

import type { CoreContext } from '../context'

import bigInt from 'big-integer'

import { and, eq } from 'drizzle-orm'
import { Api } from 'telegram'

import { joinedChatsTable } from '../schemas/joined-chats'

/**
 * Resolve an EntityLike for a dialog/chat id.
 *
 * Why: Telegram entity resolution is backed by an in-memory cache inside gramjs.
 * After process restart (or when a chat isn't cached), passing a bare numeric id
 * can lead to CHANNEL_INVALID / PEER_ID_INVALID. Persisted access_hash lets us
 * construct InputPeer* deterministically.
 */
export async function resolvePeerByChatId(
  ctx: CoreContext,
  chatId: string,
  opts: { refresh?: boolean } = {},
): Promise<EntityLike> {
  const { refresh = false } = opts

  // Best-effort DB lookup (works in both Postgres and PGlite modes)
  let hasDbRow = false
  let chatType: 'user' | 'group' | 'channel' | undefined
  let storedAccessHash: string | undefined
  if (!refresh) {
    try {
      const [row] = await ctx.getDB()
        .select({
          chatType: joinedChatsTable.chat_type,
          accessHash: joinedChatsTable.access_hash,
        })
        .from(joinedChatsTable)
        .where(and(
          eq(joinedChatsTable.platform, 'telegram'),
          eq(joinedChatsTable.chat_id, chatId),
        ))
        .limit(1)

      hasDbRow = !!row
      chatType = row?.chatType as any
      storedAccessHash = row?.accessHash?.trim?.()

      // Groups never need access_hash
      if (chatType === 'group') {
        return new Api.InputPeerChat({ chatId: bigInt(chatId) })
      }

      if (storedAccessHash && storedAccessHash !== '0') {
        if (chatType === 'user') {
          return new Api.InputPeerUser({
            userId: bigInt(chatId),
            accessHash: bigInt(storedAccessHash),
          })
        }

        // For channels AND megagroups: both are Api.Channel in Telegram and require InputPeerChannel.
        return new Api.InputPeerChannel({
          channelId: bigInt(chatId),
          accessHash: bigInt(storedAccessHash),
        })
      }
    }
    catch (error) {
      ctx.withError?.(error, 'resolvePeerByChatId DB lookup failed')
      // Ignore DB errors and fallback to client resolution.
    }
  }

  async function fetchAndBackfill(): Promise<EntityLike> {
    const entity = await ctx.getClient().getEntity(chatId) as Entity
    const peer = entityToInputPeer(entity)

    if (!peer) {
      throw new Error('Unsupported entity type for peer resolution')
    }

    // Backfill access_hash when available
    try {
      const accessHash = (peer instanceof Api.InputPeerUser || peer instanceof Api.InputPeerChannel)
        ? peer.accessHash?.toString?.()
        : undefined
      if (hasDbRow && accessHash && accessHash !== '0') {
        await ctx.getDB()
          .update(joinedChatsTable)
          .set({ access_hash: accessHash })
          .where(and(
            eq(joinedChatsTable.platform, 'telegram'),
            eq(joinedChatsTable.chat_id, chatId),
          ))
      }
    }
    catch (error) {
      // Best-effort; log but do not fail peer resolution
      ctx.withError?.(error, 'resolvePeerByChatId backfill failed')
    }

    return peer
  }

  // Fallback to gramjs entity cache / network resolution.
  try {
    const peer = await ctx.getClient().getInputEntity(chatId)

    // Backfill access_hash when gramjs managed to resolve the peer but DB is missing it.
    try {
      if (hasDbRow && (!storedAccessHash || storedAccessHash === '0')) {
        const accessHash
          = (peer instanceof Api.InputPeerUser || peer instanceof Api.InputPeerChannel)
            ? peer.accessHash?.toString?.()
            : undefined
        if (accessHash && accessHash !== '0') {
          await ctx.getDB()
            .update(joinedChatsTable)
            .set({ access_hash: accessHash })
            .where(and(
              eq(joinedChatsTable.platform, 'telegram'),
              eq(joinedChatsTable.chat_id, chatId),
            ))
        }
      }
    }
    catch (error) {
      ctx.withError?.(error, 'resolvePeerByChatId backfill failed')
    }

    return peer
  }
  catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('CHANNEL_INVALID') || msg.includes('PEER_ID_INVALID')) {
      // Retry once with a fresh network fetch to refresh access_hash.
      return fetchAndBackfill()
    }
    throw error
  }
}

function entityToInputPeer(entity: Entity): EntityLike | undefined {
  if (entity instanceof Api.User) {
    const accessHash = (entity as any).accessHash
    if (accessHash === undefined)
      return undefined
    return new Api.InputPeerUser({
      userId: entity.id,
      accessHash,
    })
  }

  if (entity instanceof Api.Channel) {
    const accessHash = (entity as any).accessHash
    if (accessHash === undefined)
      return undefined
    return new Api.InputPeerChannel({
      channelId: entity.id,
      accessHash,
    })
  }

  if (entity instanceof Api.Chat) {
    return new Api.InputPeerChat({
      chatId: entity.id,
    })
  }

  return undefined
}
