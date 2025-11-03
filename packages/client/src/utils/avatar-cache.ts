/**
 * Avatar cache utility using browser Cache API
 * Stores avatar images for offline access and performance
 */

const AVATAR_CACHE_NAME = 'telegram-search-avatars-v1'
const AVATAR_CACHE_MAX_AGE = 31536000 // 1 year in seconds

/**
 * Create a blob from avatar bytes
 * @param avatarBytes - The avatar image bytes
 * @param mimeType - The MIME type of the image
 * @returns Blob and its URL
 */
function createAvatarBlob(avatarBytes: Uint8Array, mimeType: string): { blob: Blob, url: string } {
  const blob = new Blob([avatarBytes as BlobPart], { type: mimeType })
  const url = URL.createObjectURL(blob)
  return { blob, url }
}

/**
 * Store an avatar in the browser cache
 * @param entityId - The entity ID (user/chat/channel ID)
 * @param avatarBytes - The avatar image bytes as Uint8Array
 * @returns The blob URL for the cached avatar
 */
export async function cacheAvatar(entityId: string, avatarBytes: Uint8Array): Promise<string> {
  try {
    const cache = await caches.open(AVATAR_CACHE_NAME)
    const url = `/avatars/${entityId}`

    // Try to detect the image type from the first bytes
    let mimeType = 'image/jpeg' // default
    if (avatarBytes[0] === 0x89 && avatarBytes[1] === 0x50) {
      mimeType = 'image/png'
    }
    else if (avatarBytes[0] === 0x47 && avatarBytes[1] === 0x49) {
      mimeType = 'image/gif'
    }
    else if (avatarBytes[0] === 0xFF && avatarBytes[1] === 0xD8) {
      mimeType = 'image/jpeg'
    }

    const response = new Response(avatarBytes as BlobPart, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': `max-age=${AVATAR_CACHE_MAX_AGE}`,
      },
    })

    await cache.put(url, response)

    // Create a blob URL for immediate use
    const { url: blobUrl } = createAvatarBlob(avatarBytes, mimeType)
    return blobUrl
  }
  catch (error) {
    console.error('Failed to cache avatar:', error)
    // Fallback to blob URL without caching
    const { url: blobUrl } = createAvatarBlob(avatarBytes, 'image/jpeg')
    return blobUrl
  }
}

/**
 * Get a cached avatar from the browser cache
 * @param entityId - The entity ID (user/chat/channel ID)
 * @returns The blob URL for the cached avatar, or undefined if not cached
 */
export async function getCachedAvatar(entityId: string): Promise<string | undefined> {
  try {
    const cache = await caches.open(AVATAR_CACHE_NAME)
    const url = `/avatars/${entityId}`
    const response = await cache.match(url)

    if (!response) {
      return undefined
    }

    const blob = await response.blob()
    return URL.createObjectURL(blob)
  }
  catch (error) {
    console.error('Failed to get cached avatar:', error)
    return undefined
  }
}

/**
 * Clear all cached avatars
 */
export async function clearAvatarCache(): Promise<void> {
  try {
    await caches.delete(AVATAR_CACHE_NAME)
  }
  catch (error) {
    console.error('Failed to clear avatar cache:', error)
  }
}

/**
 * Check if an avatar is cached
 * @param entityId - The entity ID (user/chat/channel ID)
 * @returns True if the avatar is cached, false otherwise
 */
export async function isAvatarCached(entityId: string): Promise<boolean> {
  try {
    const cache = await caches.open(AVATAR_CACHE_NAME)
    const url = `/avatars/${entityId}`
    const response = await cache.match(url)
    return response !== undefined
  }
  catch (error) {
    console.error('Failed to check avatar cache:', error)
    return false
  }
}
