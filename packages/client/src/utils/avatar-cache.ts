/**
 * Avatar cache utility using browser Cache API
 * Stores avatar images for offline access and performance
 */

const AVATAR_CACHE_NAME = 'telegram-search-avatars-v1'

/**
 * Store an avatar in the browser cache
 * @param entityId - The entity ID (user/chat/channel ID)
 * @param avatarBytes - The avatar image bytes
 * @returns The blob URL for the cached avatar
 */
export async function cacheAvatar(entityId: string, avatarBytes: Uint8Array): Promise<string> {
  try {
    const cache = await caches.open(AVATAR_CACHE_NAME)
    const url = `/avatars/${entityId}`
    
    // Create a response from the avatar bytes
    // Try to detect the image type from the first bytes
    let mimeType = 'image/jpeg' // default
    if (avatarBytes[0] === 0x89 && avatarBytes[1] === 0x50) {
      mimeType = 'image/png'
    } else if (avatarBytes[0] === 0x47 && avatarBytes[1] === 0x49) {
      mimeType = 'image/gif'
    } else if (avatarBytes[0] === 0xFF && avatarBytes[1] === 0xD8) {
      mimeType = 'image/jpeg'
    }
    
    const response = new Response(avatarBytes, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'max-age=31536000', // Cache for 1 year
      },
    })
    
    await cache.put(url, response)
    
    // Create a blob URL for immediate use
    const blob = new Blob([avatarBytes], { type: mimeType })
    return URL.createObjectURL(blob)
  } catch (error) {
    console.error('Failed to cache avatar:', error)
    // Fallback to blob URL without caching
    const blob = new Blob([avatarBytes], { type: 'image/jpeg' })
    return URL.createObjectURL(blob)
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
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
    console.error('Failed to check avatar cache:', error)
    return false
  }
}
