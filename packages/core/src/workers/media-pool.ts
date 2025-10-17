import type { MediaProcessResult, MediaProcessTask } from './media-processor.worker'

import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { useLogger } from '@unbird/logg'
import Tinypool from 'tinypool'

let pool: Tinypool | null = null
let isServerEnvironment: boolean | null = null

function checkServerEnvironment(): boolean {
  if (isServerEnvironment === null) {
    isServerEnvironment = typeof window === 'undefined' && typeof process !== 'undefined'
  }
  return isServerEnvironment
}

export function getMediaWorkerPool(): Tinypool | null {
  if (!checkServerEnvironment()) {
    return null
  }

  if (!pool) {
    const logger = useLogger('core:worker:media-pool')
    logger.verbose('Initializing media worker pool')

    const workerPath = fileURLToPath(new URL('./media-processor.worker.js', import.meta.url))

    pool = new Tinypool({
      filename: workerPath,
      minThreads: 1,
      maxThreads: 4,
    })

    logger.withFields({ workerPath }).verbose('Media worker pool initialized')
  }

  return pool
}

export async function processMediaInWorker(task: MediaProcessTask): Promise<MediaProcessResult> {
  const workerPool = getMediaWorkerPool()

  if (workerPool) {
    return await workerPool.run(task, { name: 'processMediaBuffer' })
  }

  // Fallback to synchronous processing in browser environment
  const { processMediaBuffer } = await import('./media-processor.worker')
  return await processMediaBuffer(task)
}

export async function destroyMediaWorkerPool(): Promise<void> {
  if (pool) {
    await pool.destroy()
    pool = null
  }
}
