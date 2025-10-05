import type { ComponentPublicInstance, App as VueApp } from 'vue'

import { createApp } from 'vue'

import SplashScreen from '../components/SplashScreen.vue'

interface SplashScreenExpose {
  hide: () => void
}

type SplashScreenInstance = ComponentPublicInstance<Record<string, never>, SplashScreenExpose>

interface SplashController {
  hide: () => void
}

type MountSplashScreen = () => SplashController

export const mountSplashScreen: MountSplashScreen = () => {
  const container: HTMLDivElement = document.createElement('div')
  document.body.appendChild(container)

  let splashApp: VueApp<Element> | null = null

  const handleAfterLeave = (): void => {
    splashApp?.unmount()
    container.remove()
    splashApp = null
  }

  splashApp = createApp(SplashScreen, {
    onAfterLeave: handleAfterLeave,
  })

  let isVisible = true

  const instance = splashApp.mount(container) as SplashScreenInstance

  const hide = (): void => {
    if (!isVisible) {
      return
    }

    isVisible = false
    instance.hide()
  }

  return { hide }
}
