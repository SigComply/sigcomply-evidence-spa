import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import nounsanitized from 'eslint-plugin-no-unsanitized'
import { defineConfig, globalIgnores } from 'eslint/config'

// Raw HTML from React; the CSP's Trusted Types would also refuse it at run time.
const noDangerousHtml = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message: 'Render text through React; raw HTML is banned (and Trusted Types refuses it).',
}

export default defineConfig([
  globalIgnores(['dist', 'dist-e2e', 'coverage', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      nounsanitized.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-restricted-syntax': ['error', noDangerousHtml],
    },
  },
  {
    // Nothing leaves the browser: the app reads its own config.json and
    // catalogs through src/lib/static-fetch.ts, which allowlists the paths.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
          name,
          message: 'Read app data through fetchStatic in src/lib/static-fetch.ts.',
        })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'navigator', property: 'sendBeacon', message: 'Nothing leaves the browser.' },
        { object: 'window', property: 'fetch', message: 'Use fetchStatic in src/lib/static-fetch.ts.' },
        { object: 'globalThis', property: 'fetch', message: 'Use fetchStatic in src/lib/static-fetch.ts.' },
      ],
    },
  },
  {
    // Parsed JSON can carry any key: `"constructor" in obj` is true for every
    // plain object, so presence checks on untrusted data use Object.hasOwn.
    files: ['src/lib/verification/**/*.ts', 'scripts/verify-*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        noDangerousHtml,
        {
          selector: "BinaryExpression[operator='in']",
          message: 'Use Object.hasOwn: `in` also finds inherited keys such as "constructor".',
        },
      ],
    },
  },
])
