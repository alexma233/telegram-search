<script setup lang="ts">
import { useAvatar } from '@tg-search/client'
import { computed, onMounted } from 'vue'

interface Props {
  src?: string
  name?: string
  size?: 'sm' | 'md' | 'lg'
  isOnline?: boolean
  entityId?: string | number // Entity ID for auto-loading avatar from cache
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  isOnline: false,
})

const sizeMap = {
  sm: 'h-6 w-6',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
}

const avatarSize = computed(() => sizeMap[props.size])

const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' })

const initials = computed(() => {
  if (!props.name)
    return ''
  const segment = segmenter.segment(props.name)[Symbol.iterator]().next().value
  if (segment) {
    return segment.segment.toUpperCase()
  }
  return ''
})

const backgroundColor = computed(() => {
  if (!props.name)
    return 'bg-neutral-100 dark:bg-gray-700'
  // 根据名字生成固定的背景色
  const colors = [
    'bg-red-500',
    'bg-pink-500',
    'bg-purple-500',
    'bg-indigo-500',
    'bg-blue-500',
    'bg-cyan-500',
    'bg-teal-500',
    'bg-green-500',
    'bg-lime-500',
    'bg-yellow-500',
    'bg-orange-500',
  ]
  const index = props.name.trim().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[index % colors.length]
})

// Use avatar composable if entityId is provided
const { avatarUrl, loadFromCache } = props.entityId ? useAvatar(props.entityId) : { avatarUrl: { value: undefined }, loadFromCache: () => {} }

// Computed src that prioritizes: explicit src prop > cached avatar > undefined
const effectiveSrc = computed(() => {
  return props.src || avatarUrl.value
})

// Load from cache on mount if entityId is provided
onMounted(() => {
  if (props.entityId && !props.src) {
    loadFromCache()
  }
})
</script>

<template>
  <div class="relative inline-block">
    <div
      class="relative flex items-center justify-center overflow-hidden rounded-full text-white font-medium" :class="[
        avatarSize,
        backgroundColor,
      ]"
    >
      <img
        v-if="effectiveSrc"
        :src="effectiveSrc"
        :alt="name"
        class="h-full w-full object-cover"
      >
      <span v-else class="text-sm">{{ initials }}</span>
    </div>
    <div
      v-if="isOnline"
      class="absolute bottom-0 right-0 h-3 w-3 border-2 border-background rounded-full bg-green-500"
    />
  </div>
</template>
