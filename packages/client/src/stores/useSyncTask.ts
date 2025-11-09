import type { CoreTask, CoreTaskData } from '@tg-search/core'

import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useSyncTaskStore = defineStore('sync-task', () => {
  const increase = ref(false)
  const currentTask = ref<CoreTask<'takeout'>>()
  const persistedTasks = ref<Omit<CoreTaskData<'takeout'>, 'abortController'>[]>([])

  const currentTaskProgress = computed(() => {
    if (!currentTask.value)
      return 0

    return currentTask.value.progress
  })

  const resumableTasks = computed(() => {
    return persistedTasks.value.filter(task =>
      task.progress >= 0 && task.progress < 100 && !task.lastError,
    )
  })

  return {
    currentTask,
    currentTaskProgress,
    increase,
    persistedTasks,
    resumableTasks,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSyncTaskStore, import.meta.hot))
}
