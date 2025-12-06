import { useLocalStorage } from '@vueuse/core'
import { converter } from 'culori'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'

export const DEFAULT_THEME_COLORS_HUE = 220.44

const convert = converter('oklch')
const getHueFrom = (color?: string) => color ? convert(color)?.h : DEFAULT_THEME_COLORS_HUE

export const useSettingsStore = defineStore('settings', () => {
  const disableSettings = ref(import.meta.env.VITE_DISABLE_SETTINGS === 'true')
  const debugMode = useLocalStorage<boolean>('settings/debug', false)
  const selectedFolderId = useLocalStorage<string>('settings/folder-selected', 'all')
  const useCachedMessage = useLocalStorage<boolean>('settings/use-cached-message-v2', true)

  const theme = useLocalStorage<string>('settings/theme', 'default')

  const themeColorsHue = useLocalStorage('settings/theme/colors/hue', DEFAULT_THEME_COLORS_HUE)
  const themeColorsHueDynamic = useLocalStorage('settings/theme/colors/hue-dynamic', false)

  // Language settings
  const language = useLocalStorage<string>('settings/language', 'en')

  const isInitialized = ref(false)

  function setThemeColorsHue(hue = DEFAULT_THEME_COLORS_HUE) {
    themeColorsHue.value = hue
    themeColorsHueDynamic.value = false
  }

  function applyPrimaryColorFrom(color?: string) {
    setThemeColorsHue(getHueFrom(color))
  }

  /**
   * Check if a color is currently selected based on its hue value
   * @param hexColor Hex color code to check
   * @returns True if the color's hue matches the current theme hue
   */
  function isColorSelectedForPrimary(hexColor?: string) {
    // If dynamic coloring is enabled, no preset color is manually selected
    if (themeColorsHueDynamic.value)
      return false

    // Convert hex color to OKLCH
    const h = getHueFrom(hexColor)
    if (!h)
      return false

    // Compare hue values with a small tolerance for floating point comparison
    const hueDifference = Math.abs(h - themeColorsHue.value)
    return hueDifference < 0.01 || hueDifference > 359.99
  }

  function init() {
    if (isInitialized.value) {
      return
    }

    isInitialized.value = true
  }

  return {
    init,
    disableSettings,
    theme,
    themeColorsHue,
    themeColorsHueDynamic,
    isColorSelectedForPrimary,
    applyPrimaryColorFrom,
    selectedFolderId,
    useCachedMessage,
    debugMode,
    language,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSettingsStore, import.meta.hot))
}
