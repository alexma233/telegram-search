<script setup lang="ts">
import type { CoreDialog } from '@tg-search/core/types'

import { VList } from 'virtua/vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import SelectDropdown from './ui/SelectDropdown.vue'

const props = defineProps<{
  chats: CoreDialog[]
}>()

const { t, locale } = useI18n()

const selectedChats = defineModel<number[]>('selectedChats', {
  required: true,
})

// Currently focused chat for status/visualization panel
const activeChatId = defineModel<number | null>('activeChatId', {
  default: null,
})

/**
 * Build chat type options localized by current language.
 * Returns localized labels with corresponding values for the dropdown.
 */
function getLocalizedChatTypeOptions(): Array<{ label: string, value: string }> {
  return [
    { label: t('chatSelector.user'), value: 'user' },
    { label: t('chatSelector.group'), value: 'group' },
    { label: t('chatSelector.channel'), value: 'channel' },
  ]
}

// Use computed so options react to language changes; depend on locale explicitly.
const chatTypeOptions = computed(() => {
  void locale.value
  return getLocalizedChatTypeOptions()
})
const selectedType = ref<string>('user')
const searchQuery = ref('')

/**
 * Performance optimization: Use Set for O(1) lookup instead of O(N) array.includes()
 * This significantly improves performance when dealing with large numbers of chats
 */
const selectedChatsSet = computed(() => new Set(selectedChats.value))

const filteredChats = computed(() => {
  let filtered = props.chats

  if (selectedType.value)
    filtered = filtered.filter(chat => chat.type === selectedType.value)

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(chat =>
      chat.name?.toLowerCase().includes(query)
      || chat.id.toString().includes(query),
    )
  }

  return filtered.map(chat => ({
    id: chat.id,
    title: chat.name || t('chatSelector.chat', { id: chat.id }),
    subtitle: t('chatSelector.id', { id: chat.id }),
    type: chat.type,
  })).sort((a, b) => {
    // Use optimized Set lookup for better performance
    const aSelected = selectedChatsSet.value.has(a.id)
    const bSelected = selectedChatsSet.value.has(b.id)
    if (aSelected && !bSelected)
      return -1
    if (!aSelected && bSelected)
      return 1
    return 0
  })
})

/**
 * Check if a chat is selected using optimized Set lookup
 * Time complexity: O(1) instead of O(N) with array.includes()
 */
function isSelected(id: number): boolean {
  return selectedChatsSet.value.has(id)
}

/**
 * Check if a chat is currently active (focused for visualization)
 */
function isActive(id: number): boolean {
  return activeChatId.value === id
}

/**
 * Toggle selection for adding to sync queue
 * This is triggered by the queue button, not the chat item itself
 */
function toggleSelection(id: number, event: MouseEvent): void {
  event.stopPropagation()

  const newSelection = [...selectedChats.value]
  const index = newSelection.indexOf(id)

  if (index === -1)
    newSelection.push(id)
  else
    newSelection.splice(index, 1)

  selectedChats.value = newSelection
}

/**
 * Select a chat to display in the visualization panel
 * Clicking the chat item now only focuses it without toggling selection
 */
function selectChat(id: number): void {
  activeChatId.value = id
}
</script>

<template>
  <div class="h-full flex flex-col space-y-4">
    <!-- Filters -->
    <div class="flex flex-shrink-0 flex-col items-start gap-3 md:flex-row md:items-center">
      <!-- Type Selection -->
      <div class="w-full md:w-48">
        <SelectDropdown
          v-model="selectedType"
          :options="chatTypeOptions"
        />
      </div>

      <!-- Search Input -->
      <div class="relative flex flex-1 items-center">
        <span class="i-lucide-search absolute left-3 h-4 w-4 text-muted-foreground" />
        <input
          v-model="searchQuery"
          type="text"
          class="h-10 w-full border rounded-lg bg-background px-3 pl-10 text-sm transition-all duration-200 focus:border-primary placeholder:text-muted-foreground focus:outline-none"
          :placeholder="t('chatSelector.search')"
        >
      </div>
    </div>

    <!-- Chat List Container -->
    <div class="min-h-0 flex-1 overflow-hidden border rounded-lg bg-card">
      <!-- No Results Message -->
      <div v-if="filteredChats.length === 0" class="h-full flex flex-col items-center justify-center py-16">
        <div class="mb-4 h-16 w-16 flex items-center justify-center rounded-full bg-muted">
          <span class="i-lucide-search-x h-8 w-8 text-muted-foreground" />
        </div>
        <p class="text-base text-muted-foreground font-medium">
          {{ t('chatSelector.noChatsFound') }}
        </p>
      </div>

      <!-- Virtual Chat List -->
      <VList
        v-else
        :data="filteredChats"
        class="h-full"
      >
        <template #default="{ item: chat }">
          <div
            :key="chat.id"
            class="group flex cursor-pointer items-center gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-accent"
            :class="{
              'bg-primary/10 ring-1 ring-primary/30': isActive(chat.id),
              'bg-primary/5': isSelected(chat.id) && !isActive(chat.id),
            }"
            @click="selectChat(chat.id)"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm text-foreground font-medium">
                {{ chat.title }}
              </p>
              <p class="truncate text-xs text-muted-foreground">
                {{ chat.subtitle }}
              </p>
            </div>
            <button
              type="button"
              class="flex shrink-0 items-center justify-center rounded-md p-2 transition-all"
              :class="isSelected(chat.id)
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'"
              :title="isSelected(chat.id) ? t('chatSelector.removeFromQueue') : t('chatSelector.addToQueue')"
              @click="toggleSelection(chat.id, $event)"
            >
              <span
                :class="isSelected(chat.id) ? 'i-lucide-check' : 'i-lucide-plus'"
                class="h-4 w-4"
              />
            </button>
          </div>
        </template>
      </VList>
    </div>
  </div>
</template>
