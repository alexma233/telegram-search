<script setup lang="ts">
import type { CoreRetrievalMessages } from '@tg-search/core/types'

import { useBridgeStore } from '@tg-search/client'
import { useDebounce, useScroll } from '@vueuse/core'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MessageList from '../../components/messages/MessageList.vue'

const { t } = useI18n()

const isLoading = ref(false)
const isLoadingMore = ref(false)

const keyword = ref<string>('')
const keywordDebounced = useDebounce(keyword, 1000)

const websocketStore = useBridgeStore()
const searchResult = ref<CoreRetrievalMessages[]>([])

const pageSize = 10
const currentOffset = ref(0)
const hasMore = ref(true)

const messageListRef = ref<HTMLElement | null>(null)

// Infinite scroll implementation
watch(keywordDebounced, (newKeyword) => {
  if (newKeyword.length === 0) {
    searchResult.value = []
    currentOffset.value = 0
    hasMore.value = true
    return
  }

  // Reset for new search
  currentOffset.value = 0
  hasMore.value = true
  searchResult.value = []

  performSearch()
})

async function performSearch(isLoadMore = false) {
  if (keywordDebounced.value.length === 0)
    return

  if (isLoadMore) {
    if (!hasMore.value || isLoadingMore.value)
      return
    isLoadingMore.value = true
  }
  else {
    isLoading.value = true
  }

  websocketStore.sendEvent('storage:search:messages', {
    content: keywordDebounced.value,
    useVector: true,
    pagination: {
      limit: pageSize,
      offset: currentOffset.value,
    },
  })

  try {
    const { messages } = await websocketStore.waitForEvent('storage:search:messages:data')

    if (isLoadMore) {
      searchResult.value = [...searchResult.value, ...messages]
    }
    else {
      searchResult.value = messages
    }

    currentOffset.value += messages.length
    hasMore.value = messages.length === pageSize
  }
  finally {
    isLoading.value = false
    isLoadingMore.value = false
  }
}

function loadMore() {
  performSearch(true)
}

// Set up scroll detection
const { arrivedState } = useScroll(messageListRef, {
  offset: { bottom: 100 },
})

watch(() => arrivedState.bottom, (isAtBottom) => {
  if (isAtBottom && hasMore.value && !isLoading.value && !isLoadingMore.value) {
    loadMore()
  }
})
</script>

<template>
  <div class="h-full flex flex-col">
    <header class="flex items-center border-b bg-card/50 px-6 py-4 backdrop-blur-sm">
      <div class="flex items-center gap-3">
        <h1 class="text-lg font-semibold">
          {{ t('search.search') }}
        </h1>
      </div>
    </header>

    <!-- 搜索栏直接放在页面顶部 -->
    <div class="flex flex-col px-8 pt-8">
      <div class="mx-auto max-w-4xl w-full flex items-center gap-2">
        <div class="relative flex flex-1 items-center">
          <span class="i-lucide-search absolute left-4 h-5 w-5 text-muted-foreground" />
          <input
            v-model="keyword"
            class="h-12 w-full border rounded-xl bg-background px-4 py-3 pl-12 pr-4 text-sm shadow-sm transition-all duration-200 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            :placeholder="t('search.searchMessages')"
          >
        </div>
      </div>
    </div>

    <!-- 搜索结果直接展示在下方 -->
    <div
      v-show="keywordDebounced"
      class="flex-1 px-8 pt-4 transition-all duration-300 ease-in-out"
      :class="{ 'opacity-0': !keywordDebounced, 'opacity-100': keywordDebounced }"
    >
      <template v-if="searchResult.length > 0">
        <div ref="messageListRef" class="h-full overflow-y-auto">
          <MessageList :messages="searchResult" :keyword="keyword" />
          <div v-if="isLoadingMore" class="flex flex-col items-center justify-center py-6 text-muted-foreground opacity-70">
            <span class="i-lucide-loader-circle mb-2 animate-spin text-2xl" />
            <span class="text-sm">{{ t('search.loadingMore') }}</span>
          </div>
          <div v-else-if="!hasMore && searchResult.length > 0" class="flex flex-col items-center justify-center py-6 text-muted-foreground opacity-50">
            <span class="text-sm">{{ t('search.noMoreResults') }}</span>
          </div>
        </div>
      </template>
      <template v-else-if="isLoading">
        <div class="flex flex-col items-center justify-center py-12 text-muted-foreground opacity-70">
          <span class="i-lucide-loader-circle mb-2 animate-spin text-3xl" />
          <span>{{ t('search.searching') }}</span>
        </div>
      </template>
      <template v-else-if="searchResult.length === 0">
        <div class="flex flex-col items-center justify-center py-12 text-muted-foreground opacity-70">
          <span class="i-lucide-search mb-2 text-3xl" />
          <span>{{ t('search.noRelatedMessages') }}</span>
        </div>
      </template>
    </div>
  </div>
</template>
