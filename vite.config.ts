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
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/__fixtures__/**",
        "src/components/ui/**",
        "src/types/**",
        "src/main.tsx",
      ],
      reporter: ["text", "html", "json-summary"],
      // Floors for the logic layers, set a little under what the suite
      // reaches. Raise them when coverage goes up; never lower them to get
      // green.
      thresholds: {
        "src/lib/**": { lines: 40, statements: 40, functions: 25, branches: 45 },
        "src/config/**": { lines: 70, statements: 65, functions: 70, branches: 45 },
      },
    },
  },
})
