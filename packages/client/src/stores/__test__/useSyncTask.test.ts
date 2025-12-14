import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

import { useSyncTaskStore } from '../useSyncTask'

const sessionId = ref('session-1')

vi.mock('../../composables/useBridge', () => ({
  useBridgeStore: () => ({
    activeSessionId: computed(() => sessionId.value),
  }),
}))

function createTask(taskId: string, chatId: string, progress: number) {
  return {
    taskId,
    type: 'takeout' as const,
    progress,
    metadata: { chatIds: [chatId] },
    createdAt: new Date(),
    updatedAt: new Date(),
    abortController: new AbortController(),
  }
}

describe('useSyncTaskStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    sessionId.value = 'session-1'
  })

  it('stores tasks per session and restores when switching back', () => {
    const store = useSyncTaskStore()
    store.setActiveBatch(['1'])
    store.upsertTask(createTask('t1', '1', 40))

    expect(store.totalChats).toBe(1)
    expect(store.batchProgress).toBe(40)

    sessionId.value = 'session-2'

    expect(store.tasks).toHaveLength(0)
    expect(store.totalChats).toBe(0)

    sessionId.value = 'session-1'
    expect(store.tasks).toHaveLength(1)
    expect(store.batchProgress).toBe(40)
  })

  it('computes batch progress across multiple chats', () => {
    const store = useSyncTaskStore()
    store.setActiveBatch(['1', '2'])
    store.upsertTask(createTask('t1', '1', 50))
    store.upsertTask(createTask('t2', '2', 100))

    expect(store.totalChats).toBe(2)
    expect(store.batchProgress).toBe(75)
    expect(store.runningTasks).toHaveLength(1)
  })
})
