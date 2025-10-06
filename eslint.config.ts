import unbird from '@unbird/eslint-config'
import importPlugin from 'eslint-plugin-import-x'

export default await unbird({
  vue: true,
  unocss: true,
  ignores: [
    'cspell.config.yaml',
    '**/drizzle/**/*.json',
    '**/*.md',
  ],
  plugins: {
    'import-x': importPlugin,
  },
  rules: {
    'import-x/no-cycle': 'error',
  },
})
