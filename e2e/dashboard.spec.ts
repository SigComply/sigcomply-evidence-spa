import type { Page } from "@playwright/test";
import { expect, pinCatalogs, test } from "./fixtures";
import type { Catalog, CatalogEntry } from "../src/types/catalog";

// 15 May 2026 12:00 UTC: yearly entries fall in period 2026.
const NOW = new Date("2026-05-15T12:00:00Z");

function entry(e: Partial<CatalogEntry> & Pick<CatalogEntry, "id" | "name">): CatalogEntry {
  return {
    control: "CC1.1",
    type: "declaration",
    frequency: "yearly",
    temporal_rule: "anytime",
    grace_period: "",
    description: "d",
    severity: "medium",
    declaration_text: "I confirm.",
    ...e,
  };
}

// The pinned catalogs are all one severity, category and frequency, so the
// filters could not narrow them. This catalog differs on every facet.
const catalog: Catalog = {
  framework: "soc2",
  version: "1",
  entries: [
    entry({ id: "alpha", name: "Alpha Policy", severity: "high", category: "people" }),
    entry({
      id: "bravo",
      name: "Bravo Drill",
      type: "checklist",
      severity: "low",
      category: "operations",
      frequency: "quarterly",
      optional: true,
      declaration_text: undefined,
      items: [{ id: "run", text: "Run it", required: true }],
    }),
    entry({ id: "charlie", name: "Charlie Review", category: "people", frequency: "monthly" }),
    entry({ id: "delta", name: "Delta Upload", type: "document_upload" }),
  ],
};

async function serveCatalog(page: Page, storage = { show_upload_path: true, prefix: "manual/" }) {
  await page.route("**/config.json", (route) =>
    route.fulfill({ json: { frameworks: ["soc2"], storage } }),
  );
  await page.route("**/data/catalogs/soc2.json", (route) => route.fulfill({ json: catalog }));
}

function openLinks(page: Page) {
  return page.getByRole("link", { name: /^Open / });
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test("search, a filter chip and Clear all narrow and restore the list", async ({ page }) => {
  await serveCatalog(page);
  await page.goto("./");
  // document_upload entries are never listed.
  await expect(openLinks(page)).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Open Delta Upload" })).toHaveCount(0);

  const search = page.getByRole("textbox", { name: "Search attestations by name, control, or ID" });
  await search.fill("bravo");
  await expect(openLinks(page)).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Open Bravo Drill" })).toBeVisible();
  await expect(page.getByText("1 of 3 ·")).toBeVisible();

  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(openLinks(page)).toHaveCount(3);

  const high = page.getByRole("button", { name: "high", exact: true });
  await high.click();
  await expect(high).toHaveAttribute("aria-pressed", "true");
  await expect(openLinks(page)).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Open Alpha Policy" })).toBeVisible();

  await page.getByRole("button", { name: "Required only", exact: true }).click();
  await page.getByRole("button", { name: "Remove filter high" }).click();
  await expect(high).toHaveAttribute("aria-pressed", "false");
  // Required only is still on, so the optional Bravo stays out.
  await expect(openLinks(page)).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Open Bravo Drill" })).toHaveCount(0);

  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect(openLinks(page)).toHaveCount(3);
});

test("a row's copy button copies the upload path", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (globalThis as unknown as { copied: string }).copied = text;
        },
      },
    });
  });
  await serveCatalog(page, { show_upload_path: true, prefix: "evidence/manual" });
  await page.goto("./");
  await page.getByRole("textbox", { name: /^Search attestations/ }).fill("alpha");
  await page.getByRole("button", { name: "Copy path inside your evidence bucket" }).click();
  await expect
    .poll(() => page.evaluate(() => (globalThis as unknown as { copied?: string }).copied))
    .toBe("evidence/manual/alpha/2026/evidence.pdf");
});

test("show_upload_path false hides the rows' copy buttons", async ({ page }) => {
  await serveCatalog(page, { show_upload_path: false, prefix: "secret/" });
  await page.goto("./");
  await expect(openLinks(page)).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Copy path inside your evidence bucket" }),
  ).toHaveCount(0);
  await expect(page.getByText("secret/", { exact: false })).toHaveCount(0);
});

test("Esc dismisses the framework picker and keeps the default", async ({ page }) => {
  await pinCatalogs(page);
  await page.goto("./");
  await expect(page.getByText("Select Your Framework")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Select Your Framework")).toBeHidden();
  await expect(page.getByRole("link", { name: "Open Code Of Conduct Acknowledgment" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("sigcomply:framework"))).toBe("soc2");
  await page.reload();
  await expect(page.getByRole("heading", { name: "User attestations" })).toBeVisible();
  await expect(page.getByText("Select Your Framework")).toBeHidden();
});
