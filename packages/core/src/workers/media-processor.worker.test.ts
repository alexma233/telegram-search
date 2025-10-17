import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { processMediaBuffer } from './media-processor.worker'

describe('media-processor.worker', () => {
  it('should process media buffer and detect mime type for PNG', async () => {
    // PNG file signature (magic bytes):
    // 89 50 4E 47 0D 0A 1A 0A - PNG signature
    // 00 00 00 0D 49 48 44 52 - IHDR chunk header
    const pngBuffer = Buffer.from([
      0x89,
      0x50,
      0x4E,
      0x47,
      0x0D,
      0x0A,
      0x1A,
      0x0A,
      0x00,
      0x00,
      0x00,
      0x0D,
      0x49,
      0x48,
      0x44,
      0x52,
    ])

    const result = await processMediaBuffer({
      messageUUID: 'test-uuid',
      byte: pngBuffer,
      type: 'photo',
      platformId: 'test-id',
    })

    expect(result.messageUUID).toBe('test-uuid')
    expect(result.type).toBe('photo')
    expect(result.platformId).toBe('test-id')
    expect(result.mimeType).toBe('image/png')
  })

  it('should handle undefined mime type for unknown buffer', async () => {
    const unknownBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00])

    const result = await processMediaBuffer({
      messageUUID: 'test-uuid',
      byte: unknownBuffer,
      type: 'document',
      platformId: 'test-id',
    })

    expect(result.messageUUID).toBe('test-uuid')
    expect(result.type).toBe('document')
    expect(result.platformId).toBe('test-id')
    expect(result.mimeType).toBeUndefined()
  })
})
