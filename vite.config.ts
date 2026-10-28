import path from "node:path"
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The app's promise that nothing leaves the browser, enforced by the browser
// itself: every fetch, script, style, font and image must come from the app's
// own origin. GitHub Pages can't send headers, so it is a meta tag. Built
// pages only, because the dev server injects inline scripts (React refresh).
// 'unsafe-inline' styles: components set style attributes. 'wasm-unsafe-eval':
// the PDF renderer's layout engine (yoga) is WebAssembly.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ")

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY },
        injectTo: "head-prepend",
      },
    ],
  }
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    // Node by default; a component test opts into jsdom with a
    // `// @vitest-environment jsdom` comment at the top of the file.
    // Playwright specs under e2e/ are not Vitest tests.
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
    globalSetup: ["scripts/vitest-node-check.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/__fixtures__/**",
        "src/components/ui/**",
        "src/types/**",
        "src/main.tsx",
        "src/test/**",
      ],
      reporter: ["text", "html", "json-summary"],
      // Floors for the logic layers, set a little under what the suite
      // reaches. Raise them when coverage goes up; never lower them to get
      // green.
      thresholds: {
        "src/lib/**": { lines: 94, statements: 94, functions: 96, branches: 87 },
        "src/config/**": { lines: 98, statements: 98, functions: 98, branches: 98 },
        "src/hooks/**": { lines: 98, statements: 98, functions: 98, branches: 69 },
      },
    },
  },
})
