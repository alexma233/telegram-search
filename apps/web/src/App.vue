<script setup lang="ts">
import { useBootstrapStore, useSettingsStore } from '@tg-search/client'
import { storeToRefs } from 'pinia'
import { hideSplashScreen } from 'vite-plugin-splash-screen/runtime'
import { onMounted, watch } from 'vue'
import { RouterView } from 'vue-router'
import { Toaster } from 'vue-sonner'

import { usePWAStore } from './stores/pwa'

const settings = storeToRefs(useSettingsStore())

onMounted(() => {
  useSettingsStore().init()
  usePWAStore().init()

  hideSplashScreen()

  useBootstrapStore().start()
})

watch(settings.themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', settings.themeColorsHue.value.toString())
}, { immediate: true })

watch(settings.themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', settings.themeColorsHueDynamic.value)
}, { immediate: true })
</script>

<template>
  <div class="min-h-screen bg-white transition-all duration-300 ease-in-out dark:bg-gray-900">
    <Toaster position="top-right" :expand="true" :rich-colors="true" />

    <RouterView v-slot="{ Component }">
      <Transition>
        <KeepAlive>
          <component :is="Component" />
        </KeepAlive>
      </Transition>
    </RouterView>
  </div>
</template>
