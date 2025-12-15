import type { ComputedRef, Ref } from 'vue'

import { useAvatarStore } from '@tg-search/client'
import { onMounted, unref, watch } from 'vue'

type MaybeRef<T> = T | Ref<T> | ComputedRef<T>
type ID = string | number

/**
 * Ensure a user's avatar is available when the component mounts.
 * Behavior:
 * - Triggers network fetch via centralized avatar store when missing.
 * - Re-runs when `userId` changes.
 */
async function ensureCore(
  idRaw: ID,
  opts: {
    hasValid: (id: string, expectedFileId?: string) => boolean
    ensureFetch: (id: string, expectedFileId?: string) => void
    expectedFileId?: string
  },
): Promise<void> {
  const id = idRaw
  if (!id)
    return
  const key = String(id)
  if (opts.hasValid(key, opts.expectedFileId))
    return

  if (!opts.hasValid(key, opts.expectedFileId))
    opts.ensureFetch(String(id), opts.expectedFileId)
}

/**
 * Generic core to ensure avatar availability for an entity.
 * Supports `user` and `chat` kinds with fetch-based loading.
 */
interface AvatarStrategy {
  hasValid: (id: string, expectedFileId?: string) => boolean
  ensureFetch: (id: string, expectedFileId?: string) => void
}
async function ensureAvatarCore(
  kind: 'user' | 'chat',
  idRaw: ID,
  fileIdRaw?: ID,
): Promise<void> {
  const avatarStore = useAvatarStore()
  const expected = fileIdRaw != null ? String(fileIdRaw) : undefined
  const strategies: Record<'user' | 'chat', AvatarStrategy> = {
    user: {
      hasValid: (id: string, _exp?: string) => avatarStore.hasValidUserAvatar(id),
      ensureFetch: (id: string, exp?: string) => avatarStore.ensureUserAvatar(id, exp),
    },
    chat: {
      hasValid: (id: string, exp?: string) => avatarStore.hasValidChatAvatar(id, exp),
      ensureFetch: (id: string, exp?: string) => avatarStore.ensureChatAvatar(id, exp),
    },
  }
  const s = strategies[kind]
  await ensureCore(idRaw, {
    hasValid: s.hasValid,
    ensureFetch: s.ensureFetch,
    expectedFileId: expected,
  })
}

async function ensureUserAvatarCore(userIdRaw: ID): Promise<void> {
  await ensureAvatarCore('user', userIdRaw)
}

export function useEnsureUserAvatar(userId: MaybeRef<ID>): void {
  async function ensure() {
    await ensureUserAvatarCore(unref(userId))
  }
  onMounted(ensure)
  watch(() => unref(userId), ensure)
}

async function ensureChatAvatarCore(chatIdRaw: ID, fileIdRaw?: ID): Promise<void> {
  await ensureAvatarCore('chat', chatIdRaw, fileIdRaw)
}

export function useEnsureChatAvatar(chatId: MaybeRef<ID>, fileId?: MaybeRef<ID>): void {
  async function ensure() {
    await ensureChatAvatarCore(unref(chatId), unref(fileId))
  }
  onMounted(ensure)
  watch([() => unref(chatId), () => unref(fileId)], ensure)
}

/**
 * Ensure a user's avatar immediately without lifecycle hooks.
 * Use when you need to trigger avatar availability from watchers or events.
 */
export async function ensureUserAvatarImmediate(userId: ID): Promise<void> {
  await ensureUserAvatarCore(userId)
}

/**
 * Ensure a chat's avatar immediately without lifecycle hooks.
 * Safe to call outside of setup() contexts.
 */
export async function ensureChatAvatarImmediate(chatId: ID, fileId?: ID): Promise<void> {
  await ensureChatAvatarCore(chatId, fileId)
}
