<script setup lang="ts">
import type { ComputedRef, StyleValue } from 'vue'

import { usePreferredReducedMotion } from '@vueuse/core'
import { computed, ref } from 'vue'

const emit = defineEmits<{
  (event: 'after-leave'): void
}>()

const isVisible = ref(true)

const reducedMotion = usePreferredReducedMotion()

const spinnerClass: ComputedRef<string> = computed(() =>
  reducedMotion.value ? '' : 'animate-spin',
)

const spinnerStyle: ComputedRef<StyleValue | undefined> = computed(() =>
  reducedMotion.value ? { animation: 'none' } : undefined,
)

const transitionClasses = 'transition-opacity duration-300 ease-in-out'

function hide(): void {
  if (!isVisible.value) {
    return
  }

  isVisible.value = false
}

function handleAfterLeave(): void {
  emit('after-leave')
}

defineExpose<{ hide: () => void }>({ hide })
</script>

<template>
  <Transition
    appear
    :enter-active-class="transitionClasses"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    :leave-active-class="transitionClasses"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
    @after-leave="handleAfterLeave"
  >
    <div
      v-if="isVisible"
      class="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-white text-slate-900 dark:bg-hex-121212 dark:text-slate-100"
    >
      <div
        class="h-12 w-12 border-[3px] border-slate-300/60 border-t-sky-500 rounded-full animate-spin"
        :class="spinnerClass"
        :style="spinnerStyle"
        aria-hidden="true"
      />
      <p role="status" aria-live="polite" class="text-base font-medium">
        Telegram Search 正在加载…
      </p>
    </div>
  </Transition>
</template>
