import { defineConfig, devices } from "@playwright/test";

// Post-deploy smoke test against the live GitHub Pages site (deploy.yml).
// Override the target with E2E_LIVE_URL (must end with a slash).
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.live.spec.ts",
  retries: 2,
  reporter: "list",
  use: {
    baseURL:
      process.env.E2E_LIVE_URL ?? "https://sigcomply.github.io/sigcomply-evidence-spa/",
    timezoneId: "UTC",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
