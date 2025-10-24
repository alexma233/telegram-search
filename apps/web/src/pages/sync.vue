<script setup lang="ts">
import { getErrorMessage, useAuthStore, useBridgeStore, useChatStore, useSettingsStore, useSyncTaskStore } from '@tg-search/client'
import NProgress from 'nprogress'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import ChatSelector from '../components/ChatSelector.vue'
import { Button } from '../components/ui/Button'
import { Progress } from '../components/ui/Progress'

const { t } = useI18n()
const router = useRouter()

const selectedChats = ref<number[]>([])

const sessionStore = useAuthStore()
const { isLoggedIn } = storeToRefs(sessionStore)
const websocketStore = useBridgeStore()

const chatsStore = useChatStore()
const { chats } = storeToRefs(chatsStore)

const syncTaskStore = useSyncTaskStore()
const { currentTask, currentTaskProgress, increase } = storeToRefs(syncTaskStore)

const settingsStore = useSettingsStore()
const { config } = storeToRefs(settingsStore)

// Default to incremental sync
if (increase.value === undefined || increase.value === null) {
  increase.value = true
}

// Get currently listening chat IDs from config
const listeningChatIds = computed(() => {
  return config.value?.api?.telegram?.listenToChatIds?.map(id => Number(id)) || []
})

// Check if currently listening
const isListening = computed(() => {
  return listeningChatIds.value.length > 0
})

// Initialize selected chats from listening config on mount
watch(config, (newConfig) => {
  if (newConfig?.api?.telegram?.listenToChatIds) {
    const listenedIds = newConfig.api.telegram.listenToChatIds.map(id => Number(id))
    // Auto-select the chats that are being listened to
    if (listenedIds.length > 0 && selectedChats.value.length === 0) {
      selectedChats.value = listenedIds
    }
  }
}, { immediate: true })

// Task in progress status
const isTaskInProgress = computed(() => {
  return !!currentTask.value && currentTaskProgress.value >= 0 && currentTaskProgress.value < 100
})

// Check if task was cancelled (not an error)
const isTaskCancelled = computed(() => {
  const task = currentTask.value
  return task?.lastError === 'Task aborted'
})

// Show task status area (includes in-progress and error states, but not cancelled)
const shouldShowTaskStatus = computed(() => {
  return !!currentTask.value && (isTaskInProgress.value || (currentTask.value.lastError && !isTaskCancelled.value))
})

// Get i18n error message from raw error
const errorMessage = computed(() => {
  const task = currentTask.value
  if (!task?.rawError)
    return task?.lastError
  return getErrorMessage(task.rawError, (key, params) => t(key, params || {}))
})

// Disable buttons during sync or when no chats selected
const isButtonDisabled = computed(() => {
  return selectedChats.value.length === 0 || !isLoggedIn.value || isTaskInProgress.value
})

function handleSync() {
  increase.value = true
  websocketStore.sendEvent('takeout:run', {
    chatIds: selectedChats.value.map(id => id.toString()),
    increase: true,
  })

  NProgress.start()
}

function handleResync() {
  increase.value = false
  websocketStore.sendEvent('takeout:run', {
    chatIds: selectedChats.value.map(id => id.toString()),
    increase: false,
  })

  NProgress.start()
}

function handleAbort() {
  if (currentTask.value) {
    websocketStore.sendEvent('takeout:task:abort', {
      taskId: currentTask.value.taskId,
    })
  }
  else {
    toast.error(t('sync.noInProgressTask'))
  }
}

// Start listening to selected chats
function handleStartListening() {
  if (!config.value || selectedChats.value.length === 0)
    return

  config.value.api = config.value.api || {}
  config.value.api.telegram = config.value.api.telegram || {}
  config.value.api.telegram.listenToChatIds = selectedChats.value.map(id => id.toString())
  websocketStore.sendEvent('config:update', { config: config.value })
  toast.success(t('sync.listeningStarted'))
}

// Stop listening to chats
function handleStopListening() {
  if (!config.value)
    return

  if (config.value.api?.telegram?.listenToChatIds) {
    config.value.api.telegram.listenToChatIds = []
    websocketStore.sendEvent('config:update', { config: config.value })
    toast.success(t('sync.listeningStopped'))
  }
}

watch(currentTaskProgress, (progress) => {
  if (progress === 100) {
    toast.success(t('sync.syncCompleted'))
    NProgress.done()
    increase.value = true
  }
  else if (progress < 0 && currentTask.value?.lastError) {
    // Check if task was cancelled
    if (isTaskCancelled.value) {
      // Task was cancelled, just clear the task and stop progress
      NProgress.done()
      currentTask.value = undefined
    }
    else {
      // Real error - progress bar UI will show it
      NProgress.done()
    }
  }
  else if (progress >= 0 && progress < 100) {
    NProgress.set(progress / 100)
  }
})
</script>

<template>
  <div class="h-full flex flex-col bg-background">
    <header class="flex items-center justify-between border-b bg-card/50 px-6 py-4 backdrop-blur-sm">
      <div class="flex items-center gap-3">
        <h1 class="text-lg font-semibold">
          {{ t('sync.sync') }}
        </h1>
      </div>

      <div class="flex items-center gap-2">
        <Button
          icon="i-lucide-refresh-cw"
          variant="ghost"
          size="sm"
          :disabled="isButtonDisabled"
          @click="handleSync"
        >
          {{ t('sync.incrementalSync') }}
        </Button>
        <Button
          icon="i-lucide-rotate-ccw"
          variant="outline"
          size="sm"
          :disabled="isButtonDisabled"
          @click="handleResync"
        >
          {{ t('sync.resync') }}
        </Button>
      </div>
    </header>

    <!-- Login prompt banner -->
    <div
      v-if="!isLoggedIn"
      class="flex items-center justify-center px-6 py-8"
    >
      <div
        class="max-w-2xl w-full border border-primary/20 rounded-2xl bg-primary/5 p-6 transition-all"
      >
        <div class="flex flex-col items-center justify-center gap-4 md:flex-row md:justify-between">
          <div class="flex items-center gap-4">
            <div class="h-12 w-12 flex flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
              <div class="i-lucide-lock-keyhole h-6 w-6 text-primary" />
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-sm text-foreground font-semibold">{{ t('loginPromptBanner.pleaseLoginToUseFullFeatures') }}</span>
              <span class="text-xs text-muted-foreground">{{ t('loginPromptBanner.subtitle') }}</span>
            </div>
          </div>
          <Button
            size="md"
            icon="i-lucide-log-in"
            class="flex-shrink-0"
            @click="router.push('/login')"
          >
            {{ t('loginPromptBanner.login') }}
          </Button>
        </div>
      </div>
    </div>

    <div v-else class="flex flex-1 flex-col overflow-hidden p-6">
      <div class="mx-auto h-full max-w-6xl w-full flex flex-col space-y-6">
        <!-- Progress bar / Error display -->
        <div
          v-if="shouldShowTaskStatus"
          class="border rounded-2xl p-6 shadow-sm transition-all"
          :class="currentTask?.lastError ? 'border-destructive/20 bg-destructive/5' : 'border-primary/20 bg-primary/5'"
        >
          <div class="space-y-4">
            <div class="flex items-center gap-4">
              <div
                class="h-12 w-12 flex flex-shrink-0 items-center justify-center rounded-full"
                :class="currentTask?.lastError ? 'bg-destructive/10' : 'bg-primary/10'"
              >
                <div v-if="currentTask?.lastError" class="i-lucide-alert-circle h-6 w-6 text-destructive" />
                <div v-else class="i-lucide-loader-2 h-6 w-6 animate-spin text-primary" />
              </div>
              <div class="flex flex-1 flex-col gap-1">
                <span class="text-base text-foreground font-semibold">
                  {{ currentTask?.lastError ? t('sync.syncFailed') : t('sync.syncing') }}
                </span>
                <span v-if="currentTask?.lastError" class="text-sm text-destructive">{{ errorMessage }}</span>
                <span v-else-if="currentTask?.lastMessage" class="text-sm text-muted-foreground">{{ currentTask.lastMessage }}</span>
              </div>
            </div>

            <Progress
              v-if="!currentTask?.lastError"
              :progress="currentTaskProgress"
            />

            <div class="flex justify-end gap-2">
              <Button
                v-if="currentTask?.lastError"
                icon="i-lucide-x"
                size="sm"
                variant="outline"
                @click="syncTaskStore.currentTask = undefined"
              >
                {{ t('sync.dismiss') }}
              </Button>
              <Button
                v-else
                icon="i-lucide-x"
                size="sm"
                variant="outline"
                @click="handleAbort"
              >
                {{ t('sync.cancel') }}
              </Button>
            </div>
          </div>
        </div>

        <!-- Chat selector section -->
        <div class="min-h-0 flex flex-1 flex-col space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg text-foreground font-semibold">
                {{ t('sync.selectChats') }}
              </h3>
              <p class="mt-1 text-sm text-muted-foreground">
                {{ t('sync.syncPrompt') }}
              </p>
            </div>

            <div class="flex items-center gap-2 rounded-full bg-muted px-4 py-2">
              <span class="i-lucide-check-circle h-4 w-4 text-primary" />
              <span class="text-sm text-foreground font-medium">
                {{ t('sync.selectedChats', { count: selectedChats.length }) }}
              </span>
            </div>
          </div>

          <!-- Listening status display -->
          <div
            v-if="isListening"
            class="border border-green-500/30 rounded-lg bg-green-500/5 p-4 shadow-sm"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="flex items-start gap-3">
                <div class="mt-0.5 h-8 w-8 flex flex-shrink-0 items-center justify-center rounded-full bg-green-500/10">
                  <div class="i-lucide-radio h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <label class="text-sm text-green-700 font-medium dark:text-green-300">
                    {{ t('sync.currentlyListening') }}
                  </label>
                  <p class="mt-1 text-xs text-green-600/80 dark:text-green-400/80">
                    {{ t('sync.listeningToCount', { count: listeningChatIds.length }) }}
                  </p>
                </div>
              </div>
              <Button
                icon="i-lucide-square"
                variant="outline"
                size="sm"
                class="border-green-600/30 text-green-700 hover:bg-green-500/10 dark:text-green-400"
                @click="handleStopListening"
              >
                {{ t('sync.stopListening') }}
              </Button>
            </div>
          </div>

          <!-- Listen to selected chats button -->
          <div
            v-if="selectedChats.length > 0 && !isListening"
            class="border rounded-lg bg-card p-4 shadow-sm"
          >
            <div class="flex items-center justify-between gap-4">
              <div>
                <label class="text-sm text-foreground font-medium">
                  {{ t('sync.listenToSelectedChats') }}
                </label>
                <p class="mt-1 text-xs text-muted-foreground">
                  {{ t('sync.listenToSelectedChatsDescription') }}
                </p>
              </div>
              <Button
                icon="i-lucide-play"
                variant="default"
                size="sm"
                @click="handleStartListening"
              >
                {{ t('sync.startListening') }}
              </Button>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-hidden">
            <ChatSelector
              v-model:selected-chats="selectedChats"
              :chats="chats"
              :listening-chat-ids="listeningChatIds"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
