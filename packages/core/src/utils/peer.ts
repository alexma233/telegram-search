import type { EntityLike } from 'telegram/define'

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
export async function resolvePeerByChatId(ctx: CoreContext, chatId: string): Promise<EntityLike> {
  // Best-effort DB lookup (works in both Postgres and PGlite modes)
  let hasDbRow = false
  let chatType: 'user' | 'group' | 'channel' | undefined
  let storedAccessHash: string | undefined
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
  catch {
    // Ignore DB errors and fallback to client resolution.
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
        if (accessHash) {
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
    catch {
      // Backfill is best-effort; ignore failures.
    }

    return peer
  }
  catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('CHANNEL_INVALID') || msg.includes('PEER_ID_INVALID')) {
      // Provide an actionable hint; the original RPC error is still logged by ctx.withError upstream.
      throw new Error(`${msg}. Peer resolution failed (missing/invalid access_hash). Try re-fetching dialogs (dialog:fetch) to refresh access_hash, or ensure the account still has access to that chat.`)
    }
    throw error
  }
}
