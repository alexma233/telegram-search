<script setup lang="ts">
import type { CoreTask } from '@tg-search/core'

import { getErrorMessage, useBridgeStore, useChatStore, useSyncTaskStore } from '@tg-search/client'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { Button } from './ui/Button'
import { Drawer } from './ui/Drawer'
import { Progress } from './ui/Progress'

const props = defineProps<{
  modelValue: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()
const { t } = useI18n()
const websocketStore = useBridgeStore()
const chatStore = useChatStore()

const syncTaskStore = useSyncTaskStore()
const { activeTasks, completedTasks, failedTasks } = storeToRefs(syncTaskStore)

const isOpen = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

// All tasks to display (active, completed recent, and failed)
const allTasks = computed(() => {
  return [
    ...activeTasks.value,
    ...completedTasks.value,
    ...failedTasks.value,
  ]
})

// Get chat name from chat ID
function getChatName(task: CoreTask<'takeout'>) {
  if (task.metadata.chatName) {
    return task.metadata.chatName
  }
  if (task.metadata.chatId) {
    const chat = chatStore.getChat(task.metadata.chatId)
    return chat?.name || task.metadata.chatId
  }
  return task.metadata.chatIds?.[0] || 'Unknown'
}

// Check if task is active (in progress)
function isTaskActive(task: CoreTask<'takeout'>) {
  return task.progress >= 0 && task.progress < 100 && !task.lastError
}

// Check if task is completed
function isTaskCompleted(task: CoreTask<'takeout'>) {
  return task.progress === 100
}

// Check if task is failed
function isTaskFailed(task: CoreTask<'takeout'>) {
  return !!task.lastError && task.lastError !== 'Task aborted'
}

// Check if task was cancelled
function isTaskCancelled(task: CoreTask<'takeout'>) {
  return task.lastError === 'Task aborted'
}

// Get localized error message
function getTaskErrorMessage(task: CoreTask<'takeout'>) {
  if (!task.rawError) {
    return task.lastError
  }
  return getErrorMessage(task.rawError, (key, params) => t(key, params || {}))
}

// Get localized task message
function getLocalizedTaskMessage(task: CoreTask<'takeout'>) {
  const msg = task.lastMessage || ''
  if (!msg)
    return ''

  // Parse progress message: "Processed 123/456 messages"
  const processedMatch = msg.match(/^Processed\s+(\d+)\/(\d+)\s+messages$/i)
  if (processedMatch) {
    const processed = Number(processedMatch[1])
    const total = Number(processedMatch[2])
    return t('sync.processedMessages', { processed, total })
  }

  // Map known status messages
  switch (msg) {
    case 'Init takeout session':
      return t('sync.initTakeoutSession')
    case 'Get messages':
      return t('sync.getMessages')
    case 'Starting incremental sync':
      return t('sync.startingIncrementalSync')
    case 'Incremental sync completed':
      return t('sync.incrementalSyncCompleted')
    default:
      return msg
  }
}

// Abort a task
function abortTask(taskId: string) {
  websocketStore.sendEvent('takeout:task:abort', { taskId })
}

// Dismiss a task (remove from list)
function dismissTask(taskId: string) {
  syncTaskStore.removeTask(taskId)
}

// Clear all completed and failed tasks
function clearAllCompleted() {
  const toRemove = [
    ...completedTasks.value.map(t => t.taskId),
    ...failedTasks.value.map(t => t.taskId),
  ]
  toRemove.forEach(id => syncTaskStore.removeTask(id))
}
</script>

<template>
  <Drawer v-model="isOpen" position="right" size="450px">
    <!-- Header -->
    <div class="flex items-center justify-between border-b bg-card/50 px-6 py-4 backdrop-blur-sm">
      <div class="flex items-center gap-3">
        <div class="i-lucide-list-checks h-5 w-5 text-primary" />
        <h2 class="text-lg font-semibold">
          {{ t('taskDrawer.title') }}
        </h2>
      </div>
      <div class="flex items-center gap-2">
        <Button
          v-if="completedTasks.length > 0 || failedTasks.length > 0"
          icon="i-lucide-trash-2"
          variant="ghost"
          size="sm"
          @click="clearAllCompleted"
        >
          {{ t('taskDrawer.clearAll') }}
        </Button>
        <Button
          icon="i-lucide-x"
          variant="ghost"
          size="sm"
          @click="isOpen = false"
        />
      </div>
    </div>

    <!-- Content -->
    <div class="min-h-0 flex-1 overflow-y-auto p-4">
      <!-- No tasks message -->
      <div v-if="allTasks.length === 0" class="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <div class="i-lucide-inbox h-12 w-12 opacity-20" />
        <p class="text-sm">
          {{ t('taskDrawer.noTasks') }}
        </p>
      </div>

      <!-- Task list -->
      <div v-else class="space-y-3">
        <div
          v-for="task in allTasks"
          :key="task.taskId"
          class="border rounded-xl p-4 shadow-sm transition-all"
          :class="{
            'border-primary/20 bg-primary/5': isTaskActive(task),
            'border-green-500/20 bg-green-500/5': isTaskCompleted(task),
            'border-destructive/20 bg-destructive/5': isTaskFailed(task),
            'border-muted/20 bg-muted/5': isTaskCancelled(task),
          }"
        >
          <!-- Task header -->
          <div class="mb-3 flex items-start gap-3">
            <div
              class="h-10 w-10 flex flex-shrink-0 items-center justify-center rounded-full"
              :class="{
                'bg-primary/10': isTaskActive(task),
                'bg-green-500/10': isTaskCompleted(task),
                'bg-destructive/10': isTaskFailed(task),
                'bg-muted/10': isTaskCancelled(task),
              }"
            >
              <div
                v-if="isTaskActive(task)"
                class="i-lucide-loader-2 h-5 w-5 animate-spin text-primary"
              />
              <div
                v-else-if="isTaskCompleted(task)"
                class="i-lucide-check-circle h-5 w-5 text-green-500"
              />
              <div
                v-else-if="isTaskFailed(task)"
                class="i-lucide-alert-circle h-5 w-5 text-destructive"
              />
              <div
                v-else
                class="i-lucide-ban h-5 w-5 text-muted-foreground"
              />
            </div>

            <div class="min-w-0 flex-1">
              <!-- Chat name -->
              <div class="truncate text-sm text-foreground font-semibold">
                {{ getChatName(task) }}
              </div>

              <!-- Status message -->
              <div
                class="mt-1 text-xs"
                :class="{
                  'text-muted-foreground': isTaskActive(task) || isTaskCancelled(task),
                  'text-green-600': isTaskCompleted(task),
                  'text-destructive': isTaskFailed(task),
                }"
              >
                <span v-if="isTaskActive(task)">
                  {{ getLocalizedTaskMessage(task) || t('sync.syncing') }}
                </span>
                <span v-else-if="isTaskCompleted(task)">
                  {{ t('sync.syncCompleted') }}
                </span>
                <span v-else-if="isTaskFailed(task)">
                  {{ getTaskErrorMessage(task) }}
                </span>
                <span v-else>
                  {{ t('sync.cancelled') }}
                </span>
              </div>
            </div>
          </div>

          <!-- Progress bar for active tasks -->
          <Progress
            v-if="isTaskActive(task)"
            :progress="task.progress"
            class="mb-3"
          />

          <!-- Actions -->
          <div class="flex justify-end gap-2">
            <Button
              v-if="isTaskActive(task)"
              icon="i-lucide-x"
              size="sm"
              variant="outline"
              @click="abortTask(task.taskId)"
            >
              {{ t('sync.cancel') }}
            </Button>
            <Button
              v-else
              icon="i-lucide-x"
              size="sm"
              variant="ghost"
              @click="dismissTask(task.taskId)"
            >
              {{ t('sync.dismiss') }}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Drawer>
</template>
