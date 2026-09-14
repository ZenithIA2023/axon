import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `android/` guarda o build do Capacitor (bundles minificados copiados de dist/):
  // lintar aquilo gerava 8 MB de saída sem nenhum erro nosso.
  globalIgnores(['dist', 'android']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Arquivos de configuração rodam no Node (process, __dirname), não no navegador.
    files: ['*.config.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
])
