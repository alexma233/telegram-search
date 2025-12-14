<script setup lang="ts">
import { useChatStore, useSyncTaskStore } from '@tg-search/client'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { Button } from './ui/Button'
import { Progress } from './ui/Progress'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const isOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value),
})

const syncTaskStore = useSyncTaskStore()
const chatStore = useChatStore()
const { tasksSorted, batchProgress, totalChats, runningTasks } = storeToRefs(syncTaskStore)
const { t } = useI18n()

const chatNameMap = computed(() => {
  const map = new Map<number, string>()
  for (const chat of chatStore.chats) {
    map.set(chat.id, chat.name || t('chatSelector.chat', { id: chat.id }))
  }
  return map
})

const hasTasks = computed(() => tasksSorted.value.length > 0)

function taskChatLabel(task: (typeof tasksSorted.value)[number]) {
  const chatId = task.chatId ?? task.metadata?.chatIds?.[0]
  if (!chatId)
    return t('sync.currentChatPlaceholder')

  const idNumber = Number(chatId)
  return chatNameMap.value.get(idNumber) || t('chatSelector.chat', { id: chatId })
}

function clearTask(taskId: string) {
  syncTaskStore.removeTask(taskId)
}

function clearFinished() {
  syncTaskStore.clearFinishedTasks()
}

function close() {
  isOpen.value = false
}
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex"
      >
        <div class="flex-1 bg-black/30 backdrop-blur-sm" @click="close" />
        <div class="bg-card border-l flex flex-col h-full max-w-xl shadow-2xl w-full">
          <div class="flex items-center justify-between border-b px-4 py-3">
            <div class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">
                {{ t('sync.chatsInBatch', { count: totalChats }) }}
              </span>
              <span class="font-semibold text-foreground text-lg">{{ t('sync.progressDrawerTitle') }}</span>
            </div>
            <div class="flex items-center gap-2">
              <Button
                icon="i-lucide-broom"
                size="sm"
                variant="ghost"
                @click="clearFinished"
              >
                {{ t('sync.clearFinished') }}
              </Button>
              <Button
                icon="i-lucide-x"
                size="sm"
                variant="outline"
                @click="close"
              >
                {{ t('sync.dismiss') }}
              </Button>
            </div>
          </div>

          <div class="border-b px-4 py-3 space-y-2">
            <div class="flex items-center justify-between text-xs text-muted-foreground">
              <span>{{ t('sync.totalChatsProgress', { count: totalChats }) }}</span>
              <span>{{ Math.round(batchProgress) }}%</span>
            </div>
            <Progress :progress="batchProgress" />
            <div class="flex items-center gap-2 text-xs text-muted-foreground">
              <span class="i-lucide-activity h-4 w-4" />
              <span>{{ t('sync.runningTasks', { count: runningTasks.length }) }}</span>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <div
              v-if="!hasTasks"
              class="border border-border border-dashed flex h-full items-center justify-center rounded-xl px-4 py-8 text-center text-sm text-muted-foreground"
            >
              <div class="space-y-2">
                <div class="i-lucide-sparkles mx-auto h-6 w-6 opacity-60" />
                <p>{{ t('sync.noBackgroundTasks') }}</p>
              </div>
            </div>

            <div
              v-for="task in tasksSorted"
              v-else
              :key="task.taskId"
              class="border rounded-xl bg-muted/60 px-4 py-3 shadow-sm"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold text-foreground">{{ taskChatLabel(task) }}</span>
                    <span
                      v-if="task.lastError"
                      class="bg-destructive/10 font-semibold rounded-full px-2 py-0.5 text-[10px] text-destructive"
                    >{{ t('sync.taskStatusError') }}</span>
                    <span
                      v-else-if="task.progress >= 100"
                      class="bg-primary/10 font-semibold rounded-full px-2 py-0.5 text-[10px] text-primary"
                    >{{ t('sync.taskStatusCompleted') }}</span>
                  </div>
                  <p class="text-xs text-muted-foreground">
                    {{ task.lastMessage || task.lastError || t('sync.inQueue') }}
                  </p>
                </div>
                <div class="flex flex-col items-end gap-1">
                  <span class="text-xs text-muted-foreground">{{ new Date(task.updatedAt).toLocaleTimeString() }}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="i-lucide-x"
                    @click="clearTask(task.taskId)"
                  >
                    {{ t('sync.dismiss') }}
                  </Button>
                </div>
              </div>

              <div class="mt-3 space-y-2">
                <Progress :progress="task.progress < 0 ? 0 : task.progress" />
                <div class="flex items-center justify-between text-xs text-muted-foreground">
                  <span v-if="task.lastError" class="text-destructive">{{ task.lastError }}</span>
                  <span v-else>{{ Math.max(0, Math.round(task.progress)) }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: all 0.2s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
  transform: translateX(10px);
}
</style>
