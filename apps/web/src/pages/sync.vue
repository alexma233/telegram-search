<script setup lang="ts">
import type { SyncOptions } from '@tg-search/core'

import NProgress from 'nprogress'

import { getErrorMessage, useAuthStore, useBridgeStore, useChatStore, useSettingsStore, useSyncTaskStore } from '@tg-search/client'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import ChatSelector from '../components/ChatSelector.vue'
import SyncOptionsComponent from '../components/SyncOptions.vue'
import SyncVisualization from '../components/SyncVisualization.vue'
import Dialog from '../components/ui/Dialog.vue'

import { Button } from '../components/ui/Button'
import { Progress } from '../components/ui/Progress'

const { t } = useI18n()
const router = useRouter()

const selectedChats = ref<number[]>([])
const syncOptions = ref<SyncOptions>({
  syncMedia: true,
  maxMediaSize: 0,
})

const sessionStore = useAuthStore()
const { isLoggedIn } = storeToRefs(sessionStore)
const websocketStore = useBridgeStore()

const chatsStore = useChatStore()
const { chats } = storeToRefs(chatsStore)

const syncTaskStore = useSyncTaskStore()
const { currentTask, currentTaskProgress, increase, chatStats, chatStatsLoading } = storeToRefs(syncTaskStore)

// Currently focused chat id for status panel; independent from multi-selection
const activeChatId = ref<number | null>(null)

// Sync options dialog state
const isSyncOptionsDialogOpen = ref(false)

const activeChat = computed(() => {
  if (!activeChatId.value)
    return undefined
  return chats.value.find(chat => chat.id === activeChatId.value)
})

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

// Track if initial load has occurred
const hasInitialLoad = ref(false)

// Initialize selected chats from listening config on mount
watch(config, (newConfig) => {
  if (newConfig?.api?.telegram?.listenToChatIds && !hasInitialLoad.value) {
    const listenedIds = newConfig.api.telegram.listenToChatIds.map(id => Number(id))
    // Auto-select the chats that are being listened to on initial load only
    if (listenedIds.length > 0) {
      selectedChats.value = listenedIds
      hasInitialLoad.value = true
    }
  }
}, { immediate: true })

// Task in progress status
const isTaskInProgress = computed(() => {
  return !!currentTask.value && currentTaskProgress.value >= 0 && currentTaskProgress.value < 100
})

// Get i18n error message from raw error
const errorMessage = computed(() => {
  const task = currentTask.value
  if (!task?.rawError)
    return task?.lastError
  return getErrorMessage(task.rawError, (key, params) => t(key, params || {}))
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

// Disable buttons during sync or when no chats selected
const isButtonDisabled = computed(() => {
  return selectedChats.value.length === 0 || !isLoggedIn.value || isTaskInProgress.value
})

const isSelectAllDisabled = computed(() => {
  return !isLoggedIn.value || isTaskInProgress.value || chats.value.length === 0
})

const allChatIds = computed(() => chats.value.map(c => c.id))

const isAllSelected = computed(() => {
  const allIds = allChatIds.value
  if (allIds.length === 0 || selectedChats.value.length !== allIds.length) {
    return false
  }
  const selectedSet = new Set(selectedChats.value)
  return allIds.every(id => selectedSet.has(id))
})

const SELECT_ALL_WARNING_THRESHOLD = 50
const isSelectAllDialogOpen = ref(false)
const selectAllCount = ref<number>(0)
const isSelectAllWarning = ref<boolean>(false)

function handleSelectAll() {
  const allIds = allChatIds.value
  const allSelected = isAllSelected.value
  selectedChats.value = allSelected ? [] : allIds
  if (!allSelected) {
    const count = allIds.length
    selectAllCount.value = count
    isSelectAllWarning.value = count >= SELECT_ALL_WARNING_THRESHOLD
    isSelectAllDialogOpen.value = true
  }
}

const localizedTaskMessage = computed(() => {
  const msg = currentTask.value?.lastMessage || ''
  if (!msg)
    return ''
  const processedMatch = msg.match(/^Processed\s+(\d+)\/(\d+)\s+messages$/i)
  if (processedMatch) {
    const processed = Number(processedMatch[1])
    const total = Number(processedMatch[2])
    return t('sync.processedMessages', { processed, total })
  }
  switch (msg) {
    case 'Init takeout session': return t('sync.initTakeoutSession')
    case 'Get messages': return t('sync.getMessages')
    case 'Starting incremental sync': return t('sync.startingIncrementalSync')
    case 'Incremental sync completed': return t('sync.incrementalSyncCompleted')
    default: return msg
  }
})

function handleSync() {
  increase.value = true
  websocketStore.sendEvent('takeout:run', {
    chatIds: selectedChats.value.map(id => id.toString()),
    increase: true,
    options: syncOptions.value,
  })
  NProgress.start()
}

function handleResync() {
  increase.value = false
  websocketStore.sendEvent('takeout:run', {
    chatIds: selectedChats.value.map(id => id.toString()),
    increase: false,
    options: syncOptions.value,
  })
  NProgress.start()
}

function handleAbort() {
  if (currentTask.value) {
    websocketStore.sendEvent('takeout:task:abort', { taskId: currentTask.value.taskId })
  }
  else {
    toast.error(t('sync.noInProgressTask'))
  }
}

function handleStartListening() {
  if (!config.value || selectedChats.value.length === 0)
    return
  config.value.api = { ...config.value.api }
  config.value.api.telegram = { ...config.value.api.telegram }
  config.value.api.telegram.listenToChatIds = selectedChats.value.map(id => id.toString())
  websocketStore.sendEvent('config:update', { config: config.value })
  toast.success(t('sync.listeningStarted'))
}

function handleStopListening() {
  if (!config.value)
    return
  if (config.value.api?.telegram?.listenToChatIds) {
    config.value.api = { ...config.value.api }
    config.value.api.telegram = { ...config.value.api.telegram }
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
    if (isTaskCancelled.value) {
      NProgress.done()
      currentTask.value = undefined
    }
    else {
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
        <h1 class="text-lg font-semibold">{{ t('sync.sync') }}</h1>
      </div>
      <div class="flex items-center gap-2">
        <Button icon="i-lucide-refresh-cw" variant="ghost" size="sm" :disabled="isButtonDisabled" @click="handleSync">
          {{ t('sync.incrementalSync') }}
        </Button>
        <Button icon="i-lucide-refresh-cw-off" variant="ghost" size="sm" :disabled="isButtonDisabled" @click="handleResync">
          {{ t('sync.resync') }}
        </Button>
        <Button icon="i-lucide-settings" variant="ghost" size="sm" @click="isSyncOptionsDialogOpen = true">
          {{ t('sync.syncOptions') }}
        </Button>
      </div>
    </header>

    <div v-if="!isLoggedIn" class="flex flex-1 flex-col overflow-hidden p-6">
      <div class="mx-auto max-w-6xl w-full rounded-2xl bg-primary/5 p-6 transition-all">
        <div class="flex flex-col items-center justify-center gap-4 md:flex-row md:justify-between">
          <div class="flex items-center gap-4">
            <div class="h-12 w-12 flex shrink-0 items-center justify-center rounded-full bg-primary/10">
              <div class="i-lucide-lock-keyhole h-6 w-6 text-primary" />
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-sm text-foreground font-semibold">{{ t('loginPromptBanner.pleaseLoginToUseFullFeatures') }}</span>
              <span class="text-xs text-muted-foreground">{{ t('loginPromptBanner.subtitle') }}</span>
            </div>
          </div>
          <Button size="md" icon="i-lucide-log-in" class="shrink-0" @click="router.push({ path: '/login', query: { redirect: '/sync' } })">
            {{ t('loginPromptBanner.login') }}
          </Button>
        </div>
      </div>
    </div>

    <div v-else class="flex flex-1 flex-col overflow-hidden p-6">
      <div class="mx-auto h-full max-w-6xl w-full flex flex-col space-y-6">
        <div class="flex flex-1 flex-col border rounded-2xl bg-card p-6 shadow-sm transition-all"
          :class="shouldShowTaskStatus ? (currentTask?.lastError ? 'border-destructive/20 bg-destructive/5' : 'border-primary/20 bg-primary/5') : 'border-border'">
          <div v-if="shouldShowTaskStatus" class="mb-6 border-b border-border/60 pb-6 space-y-4">
            <div class="flex items-center gap-4">
              <div class="h-12 w-12 flex shrink-0 items-center justify-center rounded-full"
                :class="currentTask?.lastError ? 'bg-destructive/10' : 'bg-primary/10'">
                <div v-if="currentTask?.lastError" class="i-lucide-alert-circle h-6 w-6 text-destructive" />
                <div v-else class="i-lucide-loader-2 h-6 w-6 animate-spin text-primary" />
              </div>
              <div class="flex flex-1 flex-col gap-1">
                <span class="text-base text-foreground font-semibold">
                  {{ currentTask?.lastError ? t('sync.syncFailed') : t('sync.syncing') }}
                </span>
                <span v-if="currentTask?.lastError" class="text-sm text-destructive">{{ errorMessage }}</span>
                <span v-else-if="localizedTaskMessage" class="text-sm text-muted-foreground">{{ localizedTaskMessage }}</span>
              </div>
            </div>
            <Progress v-if="!currentTask?.lastError" :progress="currentTaskProgress" />
            <div class="flex justify-end gap-2">
              <Button v-if="currentTask?.lastError" icon="i-lucide-x" size="sm" variant="outline" @click="syncTaskStore.currentTask = undefined">
                {{ t('sync.dismiss') }}
              </Button>
              <Button v-else icon="i-lucide-x" size="sm" variant="outline" @click="handleAbort">
                {{ t('sync.cancel') }}
              </Button>
            </div>
          </div>

          <div class="min-h-0 flex flex-1 flex-col space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg text-foreground font-semibold">{{ t('sync.selectChats') }}</h3>
                <p class="mt-1 text-sm text-muted-foreground">{{ t('sync.syncPrompt') }}</p>
              </div>
              <div class="flex items-center gap-3">
                <div class="flex items-center gap-2 rounded-full bg-muted px-4 py-2">
                  <span class="i-lucide-check-circle h-4 w-4 text-primary" />
                  <span class="text-sm text-foreground font-medium">{{ t('sync.selectedChats', { count: selectedChats.length }) }}</span>
                </div>
                <button class="flex appearance-none items-center gap-2 rounded-full bg-muted px-4 py-2"
                  :disabled="isSelectAllDisabled" :class="{ 'opacity-50 cursor-not-allowed': isSelectAllDisabled }" @click="handleSelectAll">
                  <span class="i-lucide-check-square h-4 w-4 text-primary" />
                  <span class="text-sm text-foreground font-medium">{{ isAllSelected ? t('sync.deselectAll') : t('sync.selectAll') }}</span>
                </button>
              </div>
            </div>

            <div v-if="isListening" class="border border-green-500/30 rounded-lg bg-green-500/5 p-4 shadow-sm">
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-start gap-3">
                  <div class="mt-0.5 h-8 w-8 flex flex-shrink-0 items-center justify-center rounded-full bg-green-500/10">
                    <div class="i-lucide-radio h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <label class="text-sm text-green-700 font-medium dark:text-green-300">{{ t('sync.currentlyListening') }}</label>
                    <p class="mt-1 text-xs text-green-600/80 dark:text-green-400/80">{{ t('sync.listeningToCount', { count: listeningChatIds.length }) }}</p>
                  </div>
                </div>
                <Button icon="i-lucide-square" variant="outline" size="sm" class="border-green-600/30 text-green-700 hover:bg-green-500/10 dark:text-green-400" @click="handleStopListening">
                  {{ t('sync.stopListening') }}
                </Button>
              </div>
            </div>

            <div v-if="selectedChats.length > 0 && !isListening" class="border rounded-lg bg-card p-4 shadow-sm">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <label class="text-sm text-foreground font-medium">{{ t('sync.listenToSelectedChats') }}</label>
                  <p class="mt-1 text-xs text-muted-foreground">{{ t('sync.listenToSelectedChatsDescription') }}</p>
                </div>
                <Button icon="i-lucide-play" variant="default" size="sm" @click="handleStartListening">
                  {{ t('sync.startListening') }}
                </Button>
              </div>
            </div>

            <div class="min-h-0 flex-1 overflow-hidden">
              <ChatSelector v-model:selected-chats="selectedChats" v-model:active-chat-id="activeChatId" :chats="chats" :listening-chat-ids="listeningChatIds" />
            </div>

            <SyncVisualization :stats="chatStats" :loading="chatStatsLoading" :chat-label="activeChat ? (activeChat.name || t('chatSelector.chat', { id: activeChat.id })) : ''" />
          </div>
        </div>
      </div>
    </div>
  </div>

  <Dialog v-model="isSyncOptionsDialogOpen" max-width="40rem">
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-base text-foreground font-semibold">{{ t('sync.syncOptions') }}</h3>
        <Button icon="i-lucide-x" size="sm" variant="outline" @click="isSyncOptionsDialogOpen = false">{{ t('sync.dismiss') }}</Button>
      </div>
      <SyncOptionsComponent v-model="syncOptions" />
    </div>
  </Dialog>

  <Dialog v-model="isSelectAllDialogOpen" max-width="32rem" persistent>
    <div class="space-y-5">
      <div class="flex items-start gap-4">
        <div class="h-12 w-12 flex items-center justify-center rounded-xl ring-1"
          :class="isSelectAllWarning ? 'bg-destructive/10 ring-destructive/30' : 'bg-primary/10 ring-primary/30'">
          <span :class="isSelectAllWarning ? 'i-lucide-alert-triangle text-destructive' : 'i-lucide-info text-primary'" class="h-6 w-6" />
        </div>
        <div class="flex-1">
          <p class="text-base text-foreground font-medium leading-relaxed">
            {{ isSelectAllWarning ? t('sync.selectAllWarning', { count: selectAllCount }) : t('sync.selectAllInfo', { count: selectAllCount }) }}
          </p>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <Button icon="i-lucide-x" size="sm" variant="outline" @click="isSelectAllDialogOpen = false">{{ t('sync.dismiss') }}</Button>
      </div>
    </div>
  </Dialog>
</template>
