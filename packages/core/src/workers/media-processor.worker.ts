// eslint-disable-next-line unicorn/prefer-node-protocol
import type { Buffer } from 'buffer'

import { fileTypeFromBuffer } from 'file-type'

export interface MediaProcessTask {
  messageUUID: string
  byte: Buffer
  type: string
  platformId: string
}

export interface MediaProcessResult {
  messageUUID: string
  type: string
  platformId: string
  mimeType?: string
}

export async function processMediaBuffer(task: MediaProcessTask): Promise<MediaProcessResult> {
  const mimeType = task.byte ? (await fileTypeFromBuffer(task.byte))?.mime : undefined

  return {
    messageUUID: task.messageUUID,
    type: task.type,
    platformId: task.platformId,
    mimeType,
  }
}

// Web Worker message handler
if (typeof globalThis !== 'undefined' && typeof globalThis.postMessage === 'function') {
  globalThis.addEventListener('message', async (event: MessageEvent<MediaProcessTask>) => {
    try {
      const result = await processMediaBuffer(event.data)
      globalThis.postMessage(result)
    }
    catch (error) {
      globalThis.postMessage({ error: error instanceof Error ? error.message : String(error) })
    }
  })
}
