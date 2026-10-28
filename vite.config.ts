import path from "node:path"
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react(), tailwindcss()],
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
