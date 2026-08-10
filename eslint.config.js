import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `netlify/` son edge functions de Deno: globales distintas (Deno, no
  // window), imports por URL y con extensión .ts. Lintarlas con la config del
  // navegador solo produce ruido. Lo que de verdad importa de ellas —el
  // parseo, la geolocalización y los agregados— vive en src/lib/analytics, que
  // sí se lintea, se typechequea con `tsc -b` y se prueba con vitest.
  globalIgnores(['dist', 'netlify']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
