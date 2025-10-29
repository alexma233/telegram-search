<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'
import { computed, ref } from 'vue'

interface DropdownOption {
  label: string
  value: string
  icon?: string
}

interface Props {
  options: DropdownOption[]
  disabled?: boolean
  buttonIcon?: string
  buttonText?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'outline' | 'ghost'
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  buttonIcon: '',
  buttonText: '',
  size: 'sm',
  variant: 'outline',
})

const emit = defineEmits<{
  select: [value: string]
}>()

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)
const buttonRef = ref<HTMLElement | null>(null)

const sizeClasses = computed(() => {
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-5 py-2.5 text-lg',
  }
  return sizes[props.size]
})

const variantClasses = computed(() => {
  const variants = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: 'border border-border bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  }
  return variants[props.variant]
})

const iconSizeClasses = computed(() => {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  }
  return sizes[props.size]
})

const dropdownPosition = ref({ top: 0, left: 0 })

function toggleDropdown() {
  if (props.disabled)
    return

  isOpen.value = !isOpen.value

  if (isOpen.value && buttonRef.value) {
    const rect = buttonRef.value.getBoundingClientRect()
    dropdownPosition.value = {
      top: rect.bottom + 4,
      left: rect.left,
    }
  }
}

function handleSelect(option: DropdownOption) {
  emit('select', option.value)
  isOpen.value = false
}

onClickOutside(dropdownRef, () => {
  isOpen.value = false
}, { ignore: [buttonRef] })
</script>

<template>
  <div class="relative">
    <button
      ref="buttonRef"
      class="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      :class="[sizeClasses, variantClasses]"
      :disabled="disabled"
      @click="toggleDropdown"
    >
      <span v-if="buttonIcon" :class="[buttonIcon, iconSizeClasses]" />
      <span v-if="buttonText">{{ buttonText }}</span>
      <span :class="['i-lucide-chevron-down transition-transform', iconSizeClasses, isOpen ? 'rotate-180' : '']" />
    </button>

    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-100 ease-out"
        enter-from-class="transform scale-95 opacity-0"
        enter-to-class="transform scale-100 opacity-100"
        leave-active-class="transition duration-75 ease-in"
        leave-from-class="transform scale-100 opacity-100"
        leave-to-class="transform scale-95 opacity-0"
      >
        <div
          v-if="isOpen"
          ref="dropdownRef"
          class="fixed z-[100] min-w-[200px] overflow-hidden border rounded-lg bg-popover shadow-lg"
          :style="{ top: `${dropdownPosition.top}px`, left: `${dropdownPosition.left}px` }"
        >
          <div class="p-1">
            <button
              v-for="option in options"
              :key="option.value"
              class="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors hover:bg-accent hover:text-accent-foreground"
              @click="handleSelect(option)"
            >
              <span v-if="option.icon" :class="[option.icon, 'h-4 w-4']" />
              <span>{{ option.label }}</span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
