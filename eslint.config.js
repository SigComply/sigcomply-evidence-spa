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

// Member forms that no-restricted-globals can't see, e.g. window.navigator.sendBeacon(...).
const noSendBeacon = {
  selector: "MemberExpression[property.name='sendBeacon']",
  message: 'Nothing leaves the browser.',
}

const noInOperator = {
  selector: "BinaryExpression[operator='in']",
  message: 'Use Object.hasOwn: `in` also finds inherited keys such as "constructor".',
}

const NETWORK_APIS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']

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
        ...NETWORK_APIS.map((name) => ({
          name,
          message: 'Read app data through fetchStatic in src/lib/static-fetch.ts.',
        })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'navigator', property: 'sendBeacon', message: 'Nothing leaves the browser.' },
        ...['window', 'globalThis', 'self'].flatMap((object) =>
          NETWORK_APIS.map((property) => ({
            object,
            property,
            message: 'Read app data through fetchStatic in src/lib/static-fetch.ts.',
          })),
        ),
      ],
      'no-restricted-syntax': ['error', noDangerousHtml, noSendBeacon],
    },
  },
  {
    // Parsed JSON can carry any key: `"constructor" in obj` is true for every
    // plain object, so presence checks on untrusted data use Object.hasOwn.
    // This block's no-restricted-syntax replaces the ones above, so it repeats
    // their selectors.
    files: ['src/lib/verification/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', noDangerousHtml, noSendBeacon, noInOperator],
    },
  },
])
