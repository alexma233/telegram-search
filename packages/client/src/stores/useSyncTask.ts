import type { ChatSyncStats, CoreTaskData } from '@tg-search/core'

import { useLocalStorage } from '@vueuse/core'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useBridgeStore } from '../composables/useBridge'

interface SessionTaskState {
  tasks: TakeoutTaskView[]
  activeBatchChatIds: string[]
}

interface TakeoutTaskView extends Omit<CoreTaskData<'takeout'>, 'createdAt' | 'updatedAt'> {
  createdAt: number
  updatedAt: number
  chatId?: string
}

const STORAGE_KEY = 'sync/tasks/v2'

function normalizeTask(task: CoreTaskData<'takeout'>): TakeoutTaskView {
  const chatId = task.metadata?.chatIds?.[0]
  return {
    taskId: task.taskId,
    type: task.type,
    progress: task.progress,
    lastMessage: task.lastMessage,
    lastError: task.lastError,
    rawError: task.rawError,
    metadata: task.metadata,
    chatId,
    createdAt: new Date(task.createdAt).getTime(),
    updatedAt: new Date(task.updatedAt).getTime(),
  }
}

export const useSyncTaskStore = defineStore('sync-task', () => {
  const bridgeStore = useBridgeStore()
  const increase = ref(false)
  const chatStats = ref<ChatSyncStats>()
  const chatStatsLoading = ref(false)
  const isDrawerOpen = ref(false)

  const sessionStates = useLocalStorage<Record<string, SessionTaskState>>(STORAGE_KEY, {})
  const activeSessionId = computed(() => bridgeStore.activeSessionId)

  const sessionState = computed<SessionTaskState>(() => {
    const key = activeSessionId.value || 'default'
    return sessionStates.value[key] ?? { tasks: [], activeBatchChatIds: [] }
  })

  const tasks = computed(() => sessionState.value.tasks)

  function setSessionState(patch: Partial<SessionTaskState>) {
    const key = activeSessionId.value || 'default'
    const current = sessionState.value
    sessionStates.value = {
      ...sessionStates.value,
      [key]: {
        ...current,
        ...patch,
      },
    }
  }

  function setActiveBatch(chatIds: string[]) {
    const uniqueIds = Array.from(new Set(chatIds.map(id => id.toString())))
    setSessionState({ activeBatchChatIds: uniqueIds })
  }

  function upsertTask(task: CoreTaskData<'takeout'>) {
    const normalized = normalizeTask(task)
    const list = [...tasks.value]
    const index = list.findIndex(item => item.taskId === normalized.taskId)

    if (index >= 0)
      list[index] = { ...list[index], ...normalized }
    else
      list.push(normalized)

    const batchSet = new Set(sessionState.value.activeBatchChatIds)
    if (normalized.chatId)
      batchSet.add(normalized.chatId)

    setSessionState({
      tasks: list,
      activeBatchChatIds: Array.from(batchSet),
    })
  }

  function clearFinishedTasks() {
    const list = tasks.value.filter(task => task.progress >= 0 && task.progress < 100 && !task.lastError)
    const nextBatch = list.length > 0 ? sessionState.value.activeBatchChatIds : []
    setSessionState({
      tasks: list,
      activeBatchChatIds: nextBatch,
    })
  }

  function removeTask(taskId: string) {
    const list = tasks.value.filter(task => task.taskId !== taskId)
    const nextBatch = list.length > 0 ? sessionState.value.activeBatchChatIds : []
    setSessionState({
      tasks: list,
      activeBatchChatIds: nextBatch,
    })
  }

  const tasksSorted = computed(() => [...tasks.value].sort((a, b) => b.updatedAt - a.updatedAt))

  const runningTasks = computed(() => tasks.value.filter(task => task.progress >= 0 && task.progress < 100 && !task.lastError))

  const latestErrorTask = computed(() => tasksSorted.value.find(task => task.lastError))

  const currentTask = computed(() => {
    return runningTasks.value[0] || tasksSorted.value[0]
  })

  const currentTaskProgress = computed(() => {
    if (!currentTask.value)
      return 0
    return currentTask.value.progress
  })

  const chatProgressMap = computed(() => {
    const map = new Map<string, number>()
    const latestTimestamps = new Map<string, number>()
    for (const task of tasks.value) {
      const chatId = task.chatId
      if (!chatId)
        continue
      const progress = task.progress < 0 ? 100 : Math.min(100, Math.max(0, task.progress))
      const lastTimestamp = latestTimestamps.get(chatId) ?? 0
      if (task.updatedAt >= lastTimestamp) {
        latestTimestamps.set(chatId, task.updatedAt)
        map.set(chatId, progress)
      }
    }
    return map
  })

  const activeBatchChatIds = computed(() => {
    if (sessionState.value.activeBatchChatIds?.length)
      return sessionState.value.activeBatchChatIds
    return Array.from(chatProgressMap.value.keys())
  })

  const totalChats = computed(() => activeBatchChatIds.value.length)

  const batchProgress = computed(() => {
    const chatIds = activeBatchChatIds.value
    if (!chatIds.length)
      return 0
    const total = chatIds.reduce((sum, chatId) => {
      const progress = chatProgressMap.value.get(chatId) ?? 0
      return sum + progress
    }, 0)
    return Number((total / chatIds.length).toFixed(2))
  })

  return {
    tasks,
    tasksSorted,
    runningTasks,
    latestErrorTask,
    currentTask,
    currentTaskProgress,
    batchProgress,
    totalChats,
    activeBatchChatIds,
    increase,
    chatStats,
    chatStatsLoading,
    isDrawerOpen,
    setActiveBatch,
    upsertTask,
    clearFinishedTasks,
    removeTask,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSyncTaskStore, import.meta.hot))
}
