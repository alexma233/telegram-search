<script setup lang="ts">
import { useAuthStore, useBridgeStore, useChatStore, useMessageResolverStore, useSyncTaskStore } from '@tg-search/client'
import NProgress from 'nprogress'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import ChatSelector from '../components/ChatSelector.vue'
import { Button } from '../components/ui/Button'
import { Switch } from '../components/ui/Switch'

const { t } = useI18n()

const selectedChats = ref<number[]>([])

const sessionStore = useAuthStore()
const { isLoggedIn } = storeToRefs(sessionStore)
const websocketStore = useBridgeStore()

const chatsStore = useChatStore()
const { chats } = storeToRefs(chatsStore)

const { currentTask, currentTaskProgress, increase } = storeToRefs(useSyncTaskStore())
const messageResolverStore = useMessageResolverStore()
const { lastError } = storeToRefs(messageResolverStore)

const loadingToast = ref<string | number>()

// 计算属性判断按钮是否应该禁用
const isButtonDisabled = computed(() => {
  // 只有在任务进行中并且进度小于100且不为负数时才禁用按钮
  const isTaskInProgress = !!currentTask.value && currentTaskProgress.value >= 0 && currentTaskProgress.value < 100
  return selectedChats.value.length === 0 || !isLoggedIn.value || isTaskInProgress
})

function handleSync() {
  websocketStore.sendEvent('takeout:run', {
    chatIds: selectedChats.value.map(id => id.toString()),
    increase: increase.value,
  })

  loadingToast.value = toast.loading(t('sync.startSync'), {
    description: t('sync.startSyncPrompt'),
  })

  // Start NProgress
  NProgress.start()
}

function handleReprocessEmbedding() {
  if (selectedChats.value.length === 0) {
    toast.error(t('sync.selectChats'))
    return
  }

  websocketStore.sendEvent('message:reprocess', {
    chatIds: selectedChats.value.map(id => id.toString()),
    resolvers: ['embedding'],
  })

  toast.loading(t('sync.reprocessing'), {
    description: t('sync.reprocessEmbedding'),
  })
}

function handleReprocessJieba() {
  if (selectedChats.value.length === 0) {
    toast.error(t('sync.selectChats'))
    return
  }

  websocketStore.sendEvent('message:reprocess', {
    chatIds: selectedChats.value.map(id => id.toString()),
    resolvers: ['jieba'],
  })

  toast.loading(t('sync.reprocessing'), {
    description: t('sync.reprocessJieba'),
  })
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

// Watch for resolver errors
watch(lastError, (error) => {
  if (!error)
    return

  // Show different error messages based on the type
  if (error.resolverName === 'embedding') {
    if (error.isRateLimited) {
      toast.error(t('sync.embeddingApiRateLimited'))
    }
    else {
      toast.error(t('sync.embeddingApiError', { error: error.error.message }))
    }
  }
  else if (error.resolverName === 'jieba') {
    toast.error(t('sync.jiebaTokenizationError', { error: error.error.message }))
  }
  else {
    toast.error(t('sync.resolverError', { resolver: error.resolverName, error: error.error.message }))
  }

  // Clear the error after showing the toast
  messageResolverStore.clearError()
})

watch(currentTaskProgress, (progress) => {
  toast.dismiss(loadingToast?.value)

  if (progress === 100) {
    toast.dismiss(loadingToast.value)
    toast.success(t('sync.syncCompleted'))
    // Complete NProgress
    NProgress.done()
    if (!increase.value) {
      increase.value = true
    }
  }
  else if (progress < 0 && currentTask.value?.lastError) {
    toast.dismiss(loadingToast.value)
    toast.error(currentTask.value.lastError)
    // Complete NProgress on error
    NProgress.done()
  }
  else {
    loadingToast.value = toast.loading(currentTask.value?.lastMessage ?? t('sync.syncing'), {
      action: {
        label: t('sync.cancel'),
        onClick: handleAbort,
      },
    })
    // Update NProgress with actual progress
    if (progress >= 0 && progress < 100) {
      NProgress.set(progress / 100)
    }
  }
})
</script>

<template>
  <header class="flex items-center border-b border-b-secondary p-4 px-4 dark:border-b-gray-700">
    <div class="flex items-center gap-2">
      <span class="text-lg text-gray-900 font-medium dark:text-gray-100">{{ t('sync.sync') }}</span>
    </div>

    <div class="ml-auto flex items-center gap-2">
      <Button
        icon="i-lucide-sparkles"
        variant="outline"
        :disabled="selectedChats.length === 0 || !isLoggedIn"
        @click="handleReprocessEmbedding"
      >
        {{ t('sync.reprocessEmbedding') }}
      </Button>
      <Button
        icon="i-lucide-text"
        variant="outline"
        :disabled="selectedChats.length === 0 || !isLoggedIn"
        @click="handleReprocessJieba"
      >
        {{ t('sync.reprocessJieba') }}
      </Button>
      <Button
        icon="i-lucide-refresh-cw"
        :disabled="isButtonDisabled"
        @click="handleSync"
      >
        {{ t('sync.sync') }}
      </Button>
    </div>
  </header>

  <div class="p-6">
    <div class="flex items-center justify-between">
      <h3 class="text-lg text-gray-900 font-medium dark:text-gray-100">
        {{ t('sync.syncPrompt') }}
      </h3>

      <div class="flex items-center gap-2">
        <div>
          <Switch
            v-model="increase"
            :label="t('sync.incrementalSync')"
          />
        </div>
        <span class="text-sm text-gray-600 dark:text-gray-400">
          {{ t('sync.selectedChats', { count: selectedChats.length }) }}
        </span>
      </div>
    </div>

    <ChatSelector
      v-model:selected-chats="selectedChats"
      :chats="chats"
    />
  </div>
</template>
