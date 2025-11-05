import type { CoreTask, CoreTaskData } from '@tg-search/core'

import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'

// Convert server task data to client task format (without methods)
type ClientTask = Omit<CoreTaskData<'takeout'>, 'abortController'> & {
  updateProgress?: CoreTask<'takeout'>['updateProgress']
  updateError?: CoreTask<'takeout'>['updateError']
  markStarted?: CoreTask<'takeout'>['markStarted']
  markCompleted?: CoreTask<'takeout'>['markCompleted']
  abort?: CoreTask<'takeout'>['abort']
  toJSON?: CoreTask<'takeout'>['toJSON']
}

export const useSyncTaskStore = defineStore('sync-task', () => {
  const increase = ref(false)
  const currentTask = ref<CoreTask<'takeout'> | ClientTask>()
  const currentTaskProgress = computed(() => {
    if (!currentTask.value)
      return 0

    return currentTask.value.progress
  })

  // Multiple concurrent tasks support
  const tasks = ref<Map<string, CoreTask<'takeout'> | ClientTask>>(new Map())

  // Add or update a task
  function setTask(task: CoreTask<'takeout'> | ClientTask) {
    tasks.value.set(task.taskId, task)
    // Set as current task only if it's the first task
    if (!currentTask.value || tasks.value.size === 1) {
      currentTask.value = task
    }
  }

  // Remove a task
  function removeTask(taskId: string) {
    tasks.value.delete(taskId)
    // If removed task was current, clear current
    if (currentTask.value?.taskId === taskId) {
      currentTask.value = undefined
    }
  }

  // Clear all tasks
  function clearTasks() {
    tasks.value.clear()
    currentTask.value = undefined
  }

  // Get active (in-progress) tasks
  const activeTasks = computed(() => {
    return Array.from(tasks.value.values()).filter(
      task => task.progress >= 0 && task.progress < 100 && !task.lastError,
    )
  })

  // Get completed tasks
  const completedTasks = computed(() => {
    return Array.from(tasks.value.values()).filter(
      task => task.progress === 100,
    )
  })

  // Get failed tasks
  const failedTasks = computed(() => {
    return Array.from(tasks.value.values()).filter(
      task => task.lastError && task.lastError !== 'Task aborted',
    )
  })

  // Check if any task is in progress
  const hasActiveTask = computed(() => activeTasks.value.length > 0)

  return {
    currentTask,
    currentTaskProgress,
    increase,
    tasks,
    setTask,
    removeTask,
    clearTasks,
    activeTasks,
    completedTasks,
    failedTasks,
    hasActiveTask,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSyncTaskStore, import.meta.hot))
}
