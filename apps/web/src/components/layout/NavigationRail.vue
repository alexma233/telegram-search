<script setup lang="ts">
import { useBridgeStore } from '@tg-search/client'
import { useDark } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import EntityAvatar from '../avatar/EntityAvatar.vue'
import { Button } from '../ui/Button'
import LanguageSelector from './LanguageSelector.vue'
import UserDropdown from './UserDropdown.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const isDark = useDark()
const websocketStore = useBridgeStore()

const userDropdownOpen = ref(false)

const navItems = computed(() => [
  { path: '/', icon: 'i-lucide-message-circle', label: t('chat.chats'), activeMatch: /^\/(chat\/.*)?$/ },
  { path: '/search', icon: 'i-lucide-search', label: t('search.search'), activeMatch: /^\/search/ },
  { path: '/ai-chat', icon: 'i-lucide-bot', label: t('aiChat.aiChat'), activeMatch: /^\/ai-chat/ },
  { path: '/sync', icon: 'i-lucide-refresh-cw', label: t('sync.sync'), activeMatch: /^\/sync/ },
  { path: '/settings', icon: 'i-lucide-settings', label: t('settings.settings'), activeMatch: /^\/settings/ },
])

function isActive(item: typeof navItems.value[0]) {
  if (item.path === '/' && route.path !== '/' && !route.path.startsWith('/chat')) return false
  return item.activeMatch.test(route.path)
}
</script>

<template>
  <div class="h-screen w-[70px] flex flex-col items-center border-r bg-card py-4">
    <!-- Logo / Home -->
    <div class="mb-6">
      <div class="h-10 w-10 flex items-center justify-center rounded-xl bg-primary/10 text-primary">
        <span class="i-lucide-send h-6 w-6" />
      </div>
    </div>

    <!-- Nav Items -->
    <div class="flex flex-1 flex-col gap-4 w-full px-2">
      <button
        v-for="item in navItems"
        :key="item.path"
        :title="item.label"
        :class="[
          'group relative flex h-12 w-full items-center justify-center rounded-xl transition-all duration-200',
          isActive(item) 
            ? 'bg-primary/10 text-primary' 
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        ]"
        @click="router.push(item.path)"
      >
        <span :class="[item.icon, 'h-6 w-6 transition-transform group-hover:scale-110']" />
        
        <!-- Active Indicator -->
        <div 
          v-if="isActive(item)"
          class="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-primary"
        />
      </button>
    </div>

    <!-- Bottom Actions -->
    <div class="mt-auto flex flex-col gap-4 items-center w-full px-2">
      <div class="flex flex-col gap-2 items-center">
         <Button
          :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
          variant="ghost"
          size="icon"
          class="h-10 w-10 rounded-xl"
          @click="isDark = !isDark"
        />
        
        <LanguageSelector align="left" />
      </div>

      <!-- User Profile -->
      <div class="relative">
        <button
          class="h-10 w-10 overflow-hidden rounded-full ring-2 ring-transparent transition-all hover:ring-primary/50"
          @click="userDropdownOpen = !userDropdownOpen"
        >
          <EntityAvatar
            v-if="websocketStore.getActiveSession()?.me?.id != null"
            :id="websocketStore.getActiveSession()?.me?.id!"
            entity="self"
            entity-type="user"
            :name="websocketStore.getActiveSession()?.me?.name"
            size="sm"
            class="h-full w-full"
          />
          <div v-else class="h-full w-full flex items-center justify-center bg-muted">
            <span class="i-lucide-user h-5 w-5 text-muted-foreground" />
          </div>
        </button>

        <!-- Dropdown -->
         <UserDropdown 
          v-model:open="userDropdownOpen" 
          class="!left-[70px] !bottom-4" 
        />
      </div>
    </div>
  </div>
</template>
