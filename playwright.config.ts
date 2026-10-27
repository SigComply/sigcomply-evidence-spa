import { defineConfig, devices } from "@playwright/test";

// The Pages-like suite: builds dist-e2e with the GitHub Pages base path and
// serves it with e2e/pages-server.ts. Set E2E_DIST to test an existing build
// instead (deploy.yml points it at the dist/ it is about to upload).
// The live smoke test has its own config: playwright.live.config.ts.
const port = Number(process.env.E2E_PORT ?? 4791);
const dist = process.env.E2E_DIST;

export default defineConfig({
  testDir: "e2e",
  testIgnore: "**/*.live.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}/sigcomply-evidence-spa/`,
    // Period keys come from the browser's local clock; pin the zone so a
    // fixed instant always lands in the same period.
    timezoneId: "UTC",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: dist
      ? `npx tsx e2e/pages-server.ts ${dist} ${port}`
      : `npm run build:e2e && npx tsx e2e/pages-server.ts dist-e2e ${port}`,
    url: `http://127.0.0.1:${port}/sigcomply-evidence-spa/`,
    // Never attach to a server another session started on this port.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
  },
});
