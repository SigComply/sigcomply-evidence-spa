import { expect, pinCatalogs, test } from "./fixtures";

// GitHub Pages answers unknown paths with 404.html (a copy of index.html)
// and status 404; the SPA must still boot and route.
test("a deep link to /verify loads the app", async ({ page }) => {
  const res = await page.goto("verify");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Verify signed evidence" })).toBeVisible();
});

test("a deep link to an evidence form loads the app", async ({ page }) => {
  await pinCatalogs(page);
  await page.goto("evidence/soc2/code_of_conduct_acknowledgment");
  await expect(page.getByRole("heading", { name: "Code Of Conduct Acknowledgment" })).toBeVisible();
});

test("an unknown route shows the in-app 404", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("sigcomply:framework", "soc2"));
  await page.goto("no/such/page");
  await expect(page.getByText("Page not found")).toBeVisible();
  await page.getByRole("link", { name: "Back to Dashboard" }).click();
  await expect(page.getByRole("heading", { name: "User attestations" })).toBeVisible();
});

test("the framework picker asks once and Verify needs no framework", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByText("Select Your Framework")).toBeVisible();
  await page.getByRole("button", { name: /ISO 27001/ }).click();
  await expect(page.getByText("Select Your Framework")).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { name: "User attestations" })).toBeVisible();
  await expect(page.getByText("Select Your Framework")).toBeHidden();
  await page.getByRole("link", { name: "Verify", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verify signed evidence" })).toBeVisible();
});

test("a framework without a catalog shows an error, not a blank page", async ({ page }) => {
  // nist has no data/catalogs/nist.json; the server answers a real 404.
  await page.route("**/config.json", (route) =>
    route.fulfill({ json: { frameworks: ["nist"] } }),
  );
  const catalog = page.waitForResponse("**/data/catalogs/nist.json");
  await page.goto("./");
  expect((await catalog).status()).toBe(404);
  await expect(page.getByText("Could not load the nist catalog")).toBeVisible();
});

test("a missing config.json falls back to the defaults", async ({ page }) => {
  await pinCatalogs(page);
  await page.route("**/config.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("./");
  // Default: soc2 only, so no picker.
  await expect(page.getByRole("link", { name: "Open Code Of Conduct Acknowledgment" })).toBeVisible();
  await expect(page.getByText("Select Your Framework")).toBeHidden();
});

// The site lives under a sub-path, so config.json must load from there, not
// from the origin root, also on a deep link that boots through 404.html.
// A root /config.json 404s on Pages and silently drops the deployment's
// config for the defaults.
test("config.json loads from the base path", async ({ page, baseURL }) => {
  await pinCatalogs(page);
  const configs: string[] = [];
  page.on("request", (req) => {
    if (req.url().endsWith("config.json")) configs.push(new URL(req.url()).pathname);
  });
  const basePath = new URL(baseURL!).pathname;
  for (const path of ["./", "evidence/soc2/code_of_conduct_acknowledgment"]) {
    const config = page.waitForResponse((r) => r.url().endsWith("config.json"));
    await page.goto(path);
    const res = await config;
    expect(new URL(res.url()).pathname).toBe(`${basePath}config.json`);
    expect(res.status()).toBe(200);
  }
  expect(configs).toEqual([`${basePath}config.json`, `${basePath}config.json`]);
});

test("the built page's Content-Security-Policy keeps fetches on the app's origin", async ({ page }) => {
  await page.goto("verify");
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("default-src 'self'");
  // The browser refuses before any request is made.
  const blocked = await page.evaluate(() =>
    fetch("https://example.invalid/collect", { method: "POST", body: "x" }).then(
      () => "sent",
      () => "blocked",
    ),
  );
  expect(blocked).toBe("blocked");
  const violations = await page.evaluate(() => (globalThis as unknown as { __csp: string[] }).__csp.splice(0));
  expect(violations).toEqual([expect.stringMatching(/^connect-src https:\/\/example\.invalid/)]);
});
