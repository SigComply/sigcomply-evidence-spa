import { expect, loadEnvelope, test } from "./fixtures";

// Post-deploy smoke test against the live site (playwright.live.config.ts).
// Small on purpose: proves the deploy serves a working app, not every flow.

test("home loads a catalog", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sigcomply:framework", "soc2"));
  const catalog = page.waitForResponse("**/data/catalogs/soc2.json");
  await page.goto("./");
  expect((await catalog).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "User attestations" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Open / }).first()).toBeVisible();
});

test("a deep link to /verify verifies a CLI envelope", async ({ page }) => {
  await page.goto("verify");
  await expect(page.getByRole("heading", { name: "Verify signed evidence" })).toBeVisible();
  await loadEnvelope(page, "sample-envelope-v1.json");
  await expect(page.getByText("Signature valid")).toBeVisible();
});
