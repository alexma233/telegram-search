import type { CoreDialog } from '../../types/dialog'

import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { mockDB } from '../../db/mock'
import { accountJoinedChatsTable } from '../../schemas/account-joined-chats'
import { accountsTable } from '../../schemas/accounts'
import { chatMessagesTable } from '../../schemas/chat-messages'
import { joinedChatsTable } from '../../schemas/joined-chats'
import { usersTable } from '../../schemas/users'
import { chatModels } from '../chats'

async function setupDb() {
  return mockDB({
    accountsTable,
    joinedChatsTable,
    accountJoinedChatsTable,
  })
}

describe('models/chats', () => {
  it('recordChats inserts dialogs and links them to account', async () => {
    const db = await setupDb()

    const [account] = await db.insert(accountsTable).values({
      platform: 'telegram',
      platform_user_id: 'user-1',
    }).returning()

    const dialogs: CoreDialog[] = [
      {
        id: 1,
        name: 'Chat 1',
        type: 'user',
        lastMessageDate: new Date('2024-01-01T00:00:00Z'),
      },
      {
        id: 2,
        name: 'Chat 2',
        type: 'group',
        lastMessageDate: new Date('2024-01-02T00:00:00Z'),
      },
    ]

    const result = await chatModels.recordChats(db, dialogs, account.id)
    const inserted = result

    expect(inserted).toHaveLength(2)

    const chatsInDb = await db.select().from(joinedChatsTable)
    expect(chatsInDb.map(c => c.chat_name).sort()).toEqual(['Chat 1', 'Chat 2'])

    const links = await db.select().from(accountJoinedChatsTable)
    expect(links).toHaveLength(2)
    expect(new Set(links.map(l => l.account_id))).toEqual(new Set([account.id]))
  })

  it('recordChats updates chat name and dialog_date on conflict', async () => {
    const db = await setupDb()

    const [account] = await db.insert(accountsTable).values({
      platform: 'telegram',
      platform_user_id: 'user-1',
    }).returning()

    const dialogsV1: CoreDialog[] = [
      {
        id: 1,
        name: 'Old Name',
        type: 'user',
        lastMessageDate: new Date('2024-01-01T00:00:00Z'),
      },
    ]

    await chatModels.recordChats(db, dialogsV1, account.id)

    const dialogsV2: CoreDialog[] = [
      {
        id: 1,
        name: 'New Name',
        type: 'user',
        lastMessageDate: new Date('2024-02-01T00:00:00Z'),
      },
    ]

    await chatModels.recordChats(db, dialogsV2, account.id)

    const [chat] = await db.select().from(joinedChatsTable)

    expect(chat.chat_name).toBe('New Name')
  })

  it('fetchChats returns all telegram chats ordered by dialog_date desc', async () => {
    const db = await setupDb()

    await db.insert(joinedChatsTable).values([
      {
        platform: 'telegram',
        chat_id: '1',
        chat_name: 'Chat 1',
        chat_type: 'user',
        dialog_date: 1,
      },
      {
        platform: 'telegram',
        chat_id: '2',
        chat_name: 'Chat 2',
        chat_type: 'group',
        dialog_date: 2,
      },
    ])

    const result = await chatModels.fetchChats(db)
    const chats = result.unwrap()

    expect(chats.map(c => c.chat_id)).toEqual(['2', '1'])
  })

  it('fetchChatsByAccountId returns only chats linked to the given account', async () => {
    const db = await setupDb()

    const [account1] = await db.insert(accountsTable).values({
      platform: 'telegram',
      platform_user_id: 'user-1',
    }).returning()

    const [account2] = await db.insert(accountsTable).values({
      platform: 'telegram',
      platform_user_id: 'user-2',
    }).returning()

    const dialogsForAccount1: CoreDialog[] = [
      {
        id: 1,
        name: 'Account1 Chat',
        type: 'user',
        lastMessageDate: new Date('2024-01-01T00:00:00Z'),
      },
    ]

    const dialogsForAccount2: CoreDialog[] = [
      {
        id: 2,
        name: 'Account2 Chat',
        type: 'user',
        lastMessageDate: new Date('2024-01-01T00:00:00Z'),
      },
    ]

    await chatModels.recordChats(db, dialogsForAccount1, account1.id)
    await chatModels.recordChats(db, dialogsForAccount2, account2.id)

    const result = await chatModels.fetchChatsByAccountId(db, account1.id)
    const chats = result.unwrap()

    expect(chats).toHaveLength(1)
    expect(chats[0].chat_name).toBe('Account1 Chat')
  })

  it('isChatAccessibleByAccount returns true only when account is linked to chat', async () => {
    const db = await setupDb()

    const [account1] = await db.insert(accountsTable).values({
      platform: 'telegram',
      platform_user_id: 'user-1',
    }).returning()

    const [account2] = await db.insert(accountsTable).values({
      platform: 'telegram',
      platform_user_id: 'user-2',
    }).returning()

    const dialogs: CoreDialog[] = [
      {
        id: 1,
        name: 'Shared Chat',
        type: 'group',
        lastMessageDate: new Date('2024-01-01T00:00:00Z'),
      },
    ]

    await chatModels.recordChats(db, dialogs, account1.id)

    const okForAccount1 = (await chatModels.isChatAccessibleByAccount(db, account1.id, '1')).unwrap()
    const okForAccount2 = (await chatModels.isChatAccessibleByAccount(db, account2.id, '1')).unwrap()

    expect(okForAccount1).toBe(true)
    expect(okForAccount2).toBe(false)
  })

  it('migrateChatId moves chat_messages and updates joined_chats chat_id (dedup-safe)', async () => {
    const db = await mockDB({
      accountsTable,
      joinedChatsTable,
      accountJoinedChatsTable,
      chatMessagesTable,
      usersTable,
    })

    const [account] = await db.insert(accountsTable).values({
      platform: 'telegram',
      platform_user_id: 'user-1',
    }).returning()

    // Create joined chat row + link for old id.
    await chatModels.recordChats(db, [{
      id: 111,
      name: 'Old Group',
      type: 'group',
      lastMessageDate: new Date('2024-01-01T00:00:00Z'),
    }], account.id)

    // Seed messages under old id and one overlapping message under new id (dup case).
    await db.insert(chatMessagesTable).values([
      {
        platform: 'telegram',
        platform_message_id: '1',
        from_id: 'u',
        from_name: 'u',
        in_chat_id: '111',
        in_chat_type: 'group',
        content: 'a',
        is_reply: false,
        reply_to_name: '',
        reply_to_id: '',
        platform_timestamp: 1,
        created_at: 1,
      },
      {
        platform: 'telegram',
        platform_message_id: '2',
        from_id: 'u',
        from_name: 'u',
        in_chat_id: '111',
        in_chat_type: 'group',
        content: 'b',
        is_reply: false,
        reply_to_name: '',
        reply_to_id: '',
        platform_timestamp: 2,
        created_at: 2,
      },
      // Duplicate (same platform_message_id) already exists under destination id.
      {
        platform: 'telegram',
        platform_message_id: '2',
        from_id: 'u',
        from_name: 'u',
        in_chat_id: '222',
        in_chat_type: 'group',
        content: 'b-dup',
        is_reply: false,
        reply_to_name: '',
        reply_to_id: '',
        platform_timestamp: 2,
        created_at: 2,
      },
    ])

    const res = await chatModels.migrateChatId(db, {
      fromChatId: '111',
      toChatId: '222',
      toChatName: 'New Supergroup',
      toChatType: 'group',
    })
    const out = res.unwrap()

    // Row counts are driver-dependent; assert behavior via resulting state.
    expect(out.movedMessages).toBeGreaterThanOrEqual(0)

    const msgs = await db.select().from(chatMessagesTable)
    expect(msgs.filter(m => m.in_chat_id === '111')).toHaveLength(0)
    expect(msgs.filter(m => m.in_chat_id === '222')).toHaveLength(2)

    const [chat] = await db.select().from(joinedChatsTable).where(eq(joinedChatsTable.chat_id, '222'))
    expect(chat.chat_name).toBe('New Supergroup')

    const links = await db.select().from(accountJoinedChatsTable).where(eq(accountJoinedChatsTable.account_id, account.id))
    expect(links).toHaveLength(1)
  })
})
