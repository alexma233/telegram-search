# Multi-Account Support Migration Guide

This guide explains how to populate the `owner_user_id` field for existing data after applying migrations 0017 and 0018.

## Background

The `owner_user_id` field has been added to the following tables to support multi-account functionality:
- `chat_messages`
- `joined_chats`
- `stickers`
- `sticker_packs`
- `photos`
- `recent_sent_stickers`

## Getting Current User ID

The current user ID can be obtained via the Telegram API:

```typescript
// In your application code
const apiUser = await client.getMe()
const userId = apiUser.id.toString()
```

Or through the event system:

```typescript
// Emit event to get current user info
ctx.emitter.emit('entity:me:fetch')

// Listen for the response
ctx.emitter.on('entity:me:data', (userData) => {
  const userId = userData.id
  // Use this ID for populating owner_user_id
})
```

## Populating owner_user_id for Existing Data

### Option 1: SQL Update (Recommended for production)

After obtaining your user ID, you can populate all existing records with a single SQL statement:

```sql
-- Replace 'YOUR_USER_ID' with your actual Telegram user ID
BEGIN;

UPDATE chat_messages 
SET owner_user_id = 'YOUR_USER_ID' 
WHERE owner_user_id IS NULL;

UPDATE joined_chats 
SET owner_user_id = 'YOUR_USER_ID' 
WHERE owner_user_id IS NULL;

UPDATE stickers 
SET owner_user_id = 'YOUR_USER_ID' 
WHERE owner_user_id IS NULL;

UPDATE sticker_packs 
SET owner_user_id = 'YOUR_USER_ID' 
WHERE owner_user_id IS NULL;

UPDATE photos 
SET owner_user_id = 'YOUR_USER_ID' 
WHERE owner_user_id IS NULL;

UPDATE recent_sent_stickers 
SET owner_user_id = 'YOUR_USER_ID' 
WHERE owner_user_id IS NULL;

COMMIT;
```

### Option 2: Via TypeScript/Application Code

For browser mode (PGlite) or if you prefer to do it programmatically:

```typescript
import { withDb } from '@tg-search/core'
import { 
  chatMessagesTable, 
  joinedChatsTable, 
  stickersTable, 
  stickerPacksTable, 
  photosTable, 
  recentSentStickersTable 
} from '@tg-search/core/schemas'
import { isNull, sql } from 'drizzle-orm'

async function populateOwnerUserId(userId: string) {
  await withDb(async (db) => {
    // Update chat_messages
    await db.update(chatMessagesTable)
      .set({ owner_user_id: userId })
      .where(isNull(chatMessagesTable.owner_user_id))
    
    // Update joined_chats
    await db.update(joinedChatsTable)
      .set({ owner_user_id: userId })
      .where(isNull(joinedChatsTable.owner_user_id))
    
    // Update stickers
    await db.update(stickersTable)
      .set({ owner_user_id: userId })
      .where(isNull(stickersTable.owner_user_id))
    
    // Update sticker_packs
    await db.update(stickerPacksTable)
      .set({ owner_user_id: userId })
      .where(isNull(stickerPacksTable.owner_user_id))
    
    // Update photos
    await db.update(photosTable)
      .set({ owner_user_id: userId })
      .where(isNull(photosTable.owner_user_id))
    
    // Update recent_sent_stickers
    await db.update(recentSentStickersTable)
      .set({ owner_user_id: userId })
      .where(isNull(recentSentStickersTable.owner_user_id))
  })
}

// Usage:
// Get current user ID first
const currentUser = await entityService.getMeInfo()
const userId = currentUser.unwrap().id
await populateOwnerUserId(userId)
```

## Future Considerations

### Automatic Population for New Records

Going forward, when inserting new records, ensure the `owner_user_id` is set:

```typescript
// Example: Recording messages with owner_user_id
const currentUserId = getCurrentUserId() // Get from session/context

const message: CoreMessage = {
  // ... other fields
  ownerUserId: currentUserId // Add this field to CoreMessage type if needed
}
```

### Filtering by Owner

Once populated, you can filter queries by owner:

```typescript
// Example: Get messages for current user only
const userMessages = await db
  .select()
  .from(chatMessagesTable)
  .where(eq(chatMessagesTable.owner_user_id, currentUserId))
```

## Verification

To verify that the migration was successful:

```sql
-- Check if all records have been populated
SELECT 
  (SELECT COUNT(*) FROM chat_messages WHERE owner_user_id IS NULL) as messages_null,
  (SELECT COUNT(*) FROM joined_chats WHERE owner_user_id IS NULL) as chats_null,
  (SELECT COUNT(*) FROM stickers WHERE owner_user_id IS NULL) as stickers_null,
  (SELECT COUNT(*) FROM sticker_packs WHERE owner_user_id IS NULL) as packs_null,
  (SELECT COUNT(*) FROM photos WHERE owner_user_id IS NULL) as photos_null,
  (SELECT COUNT(*) FROM recent_sent_stickers WHERE owner_user_id IS NULL) as recent_null;
```

All counts should be 0 after successful migration.

## Notes

- The `owner_user_id` field is currently nullable to maintain backward compatibility
- In a future major version, this field could be made NOT NULL after ensuring all data is migrated
- The unique constraint on `joined_chats` has been improved from `(chat_id)` to `(platform, chat_id)` to properly support multiple accounts accessing the same chat
