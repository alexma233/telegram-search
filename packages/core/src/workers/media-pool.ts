import type { MediaProcessResult, MediaProcessTask } from './media-processor.worker'

import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { useLogger } from '@unbird/logg'
import Worker from 'web-worker'

let workers: Worker[] = []
let currentWorkerIndex = 0
const MAX_WORKERS = 4
let isServerEnvironment: boolean | null = null

function checkServerEnvironment(): boolean {
  if (isServerEnvironment === null) {
    isServerEnvironment = typeof window === 'undefined' && typeof process !== 'undefined'
  }
  return isServerEnvironment
}

function getOrCreateWorker(): Worker | null {
  if (!checkServerEnvironment()) {
    return null
  }

  if (workers.length === 0) {
    const logger = useLogger('core:worker:media-pool')
    logger.verbose('Initializing media workers')

    const workerPath = fileURLToPath(new URL('./media-processor.worker.js', import.meta.url))

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
  const worker = getOrCreateWorker()

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

export async function destroyMediaWorkerPool(): Promise<void> {
  for (const worker of workers) {
    worker.terminate()
  }
  workers = []
  currentWorkerIndex = 0
}

export function getMediaWorkerPool() {
  return workers.length > 0 ? workers : null
}
