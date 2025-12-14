export type DialogType = 'user' | 'group' | 'channel'

export interface CoreDialog {
  id: number
  name: string
  type: DialogType
  /**
   * Telegram access hash for user/channel-like dialogs.
   * This is persisted to DB so we can construct InputPeer* without relying on
   * the Telegram client's ephemeral entity cache.
   */
  accessHash?: string
  unreadCount?: number
  messageCount?: number
  lastMessage?: string
  lastMessageDate?: Date
  // Optional avatar metadata and client blob url
  avatarFileId?: string
  avatarUpdatedAt?: Date
  avatarBlobUrl?: string
}
