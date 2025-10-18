import type { MediaProcessResult, MediaProcessTask } from './media-processor.worker'

import { useLogger } from '@unbird/logg'
import Worker from 'web-worker'

let workers: Worker[] = []
let currentWorkerIndex = 0
const MAX_WORKERS = 4
let isServerEnvironment: boolean | null = null
let workerUrl: string | null = null

function checkServerEnvironment(): boolean {
  if (isServerEnvironment === null) {
    // Check if we're in Node.js environment
    // Using try-catch to avoid direct process reference that breaks linting
    try {
      isServerEnvironment = typeof window === 'undefined' && typeof require !== 'undefined'
    }
    catch {
      isServerEnvironment = false
    }
  }
  return isServerEnvironment
}

/**
 * Setup worker pool with explicit worker URL
 * 
 * Call this function before processing any media to provide the worker URL explicitly.
 * This is useful when the worker file path cannot be resolved automatically.
 * 
 * @param url - The URL or path to the media-processor.worker.mjs file
 * @param maxWorkers - Maximum number of workers to create (default: 4)
 * 
 * @example
 * ```typescript
 * import { setupWorkers, createCoreContext } from '@tg-search/core'
 * 
 * // In Node.js, provide the path to the worker file
 * setupWorkers('./node_modules/@tg-search/core/dist/workers/media-processor.worker.mjs')
 * 
 * // Then create your core context
 * const ctx = createCoreContext()
 * ```
 */
export function setupWorkers(url: string, maxWorkers = MAX_WORKERS): void {
  const logger = useLogger('core:worker:media-pool')
  
  if (workers.length > 0) {
    logger.warn('Workers already initialized, destroying existing pool')
    destroyMediaWorkerPool()
  }
  
  workerUrl = url
  logger.withFields({ workerUrl, maxWorkers }).verbose('Worker URL configured')
}

async function getOrCreateWorker(): Promise<Worker | null> {
  if (!checkServerEnvironment()) {
    return null
  }

  if (workers.length === 0) {
    const logger = useLogger('core:worker:media-pool')
    logger.verbose('Initializing media workers')

    let workerPath: string
    
    if (workerUrl) {
      // Use explicitly provided worker URL
      workerPath = workerUrl
      logger.debug('Using provided worker URL')
    }
    else {
      // Fall back to dynamic path resolution
      logger.debug('No worker URL provided, using dynamic resolution')
      const { fileURLToPath } = await import('node:url')
      workerPath = fileURLToPath(new URL('./workers/media-processor.worker.mjs', import.meta.url))
    }

    // Create worker pool
    for (let i = 0; i < MAX_WORKERS; i++) {
      const worker = new Worker(workerPath, { type: 'module' })
      workers.push(worker)
    }

    logger.withFields({ count: MAX_WORKERS, workerPath }).verbose('Media workers initialized')
  }

  // Round-robin worker selection
  const worker = workers[currentWorkerIndex]
  currentWorkerIndex = (currentWorkerIndex + 1) % workers.length
  return worker
}

export async function processMediaInWorker(task: MediaProcessTask): Promise<MediaProcessResult> {
  const worker = await getOrCreateWorker()

  if (worker) {
    // Store worker reference to avoid TypeScript null check issues
    const workerRef = worker
    return new Promise((resolve, reject) => {
      function handleError(error: ErrorEvent) {
        workerRef.removeEventListener('message', handleMessage)
        workerRef.removeEventListener('error', handleError)
        reject(error)
      }

      function handleMessage(event: MessageEvent) {
        workerRef.removeEventListener('message', handleMessage)
        workerRef.removeEventListener('error', handleError)
        resolve(event.data)
      }

      workerRef.addEventListener('message', handleMessage)
      workerRef.addEventListener('error', handleError)
      workerRef.postMessage(task)
    })
  }

  // Fallback to synchronous processing in browser environment
  const { processMediaBuffer } = await import('./media-processor.worker')
  return await processMediaBuffer(task)
}

export function destroyMediaWorkerPool(): void {
  for (const worker of workers) {
    worker.terminate()
  }
  workers = []
  currentWorkerIndex = 0
  workerUrl = null
}

export function getMediaWorkerPool() {
  return workers.length > 0 ? workers : null
}
