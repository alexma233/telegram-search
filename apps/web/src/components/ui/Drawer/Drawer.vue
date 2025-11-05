<script setup lang="ts">
import { computed } from 'vue'

interface DrawerProps {
  modelValue: boolean
  position?: 'left' | 'right' | 'top' | 'bottom'
  size?: string
  persistent?: boolean
}

const props = withDefaults(defineProps<DrawerProps>(), {
  position: 'right',
  size: '400px',
  persistent: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const transformClass = computed(() => {
  const baseClass = 'transform transition-transform duration-300 ease-in-out'
  if (!isOpen.value) {
    switch (props.position) {
      case 'left':
        return `${baseClass} -translate-x-full`
      case 'right':
        return `${baseClass} translate-x-full`
      case 'top':
        return `${baseClass} -translate-y-full`
      case 'bottom':
        return `${baseClass} translate-y-full`
    }
  }
  return `${baseClass} translate-x-0 translate-y-0`
})

const positionClass = computed(() => {
  switch (props.position) {
    case 'left':
      return 'inset-y-0 left-0'
    case 'right':
      return 'inset-y-0 right-0'
    case 'top':
      return 'inset-x-0 top-0'
    case 'bottom':
      return 'inset-x-0 bottom-0'
  }
})

const sizeStyle = computed(() => {
  if (props.position === 'left' || props.position === 'right') {
    return { width: props.size }
  }
  else {
    return { height: props.size }
  }
})

function closeDrawer() {
  if (!props.persistent) {
    isOpen.value = false
  }
}
</script>

<template>
  <!-- Backdrop -->
  <Transition
    enter-active-class="transition-opacity duration-300"
    leave-active-class="transition-opacity duration-300"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <div
      v-if="isOpen"
      class="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
      @click="closeDrawer"
    />
  </Transition>

  <!-- Drawer -->
  <div
    :class="[transformClass, positionClass]"
    :style="sizeStyle"
    class="fixed z-50 bg-card shadow-xl border-l flex flex-col"
  >
    <slot />
  </div>
</template>
