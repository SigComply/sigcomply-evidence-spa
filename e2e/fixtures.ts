import { test as base, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const FIXTURES = join(
  import.meta.dirname,
  "..",
  "src",
  "lib",
  "verification",
  "__fixtures__",
);

export function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

/** Hands the /verify page an envelope through its file input. */
export async function loadEnvelope(page: Page, name: string, body = fixture(name)) {
  await page
    .locator('input[type=file][accept="application/json,.json"]')
    .setInputFiles({ name, mimeType: "application/json", buffer: body });
}

export async function loadPdf(page: Page, name: string, body: Buffer, mimeType = "application/pdf") {
  await page
    .locator('input[type=file][accept="application/pdf,.pdf"]')
    .setInputFiles({ name, mimeType, buffer: body });
}

// Every test also asserts the app's core promise: nothing leaves the
// browser. Any request to another origin fails the test that caused it.
export const test = base.extend<{ sameOriginOnly: void }>({
  sameOriginOnly: [
    async ({ page, baseURL }, use) => {
      const origin = new URL(baseURL!).origin;
      const foreign: string[] = [];
      page.on("request", (req) => {
        const url = req.url();
        if (url.startsWith("data:") || url.startsWith("blob:")) return;
        if (new URL(url).origin !== origin) foreign.push(url);
      });
      await use();
      expect(foreign, "requests that left the app's origin").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
