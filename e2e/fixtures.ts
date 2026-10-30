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

/**
 * Pinned catalogs: copies of public/data/catalogs/ that only a person
 * changes. They are not public/data/catalogs/ itself, because deploy.yml's
 * `npm run build` overwrites that folder with the latest CLI's catalogs before
 * this suite runs. Refresh them on purpose (docs/TESTING.md, "Pinned
 * catalogs") when a spec needs an entry they lack.
 */
export const PINNED_CATALOGS = join(import.meta.dirname, "fixtures", "catalogs");

/**
 * Serves the pinned catalogs instead of the ones in the build. deploy.yml
 * runs this suite on a build with catalogs fresh from the latest CLI; specs
 * that name entries pin them so a CLI catalog change can't turn the deploy
 * red. Specs that don't name entries use the built catalogs.
 */
export async function pinCatalogs(page: Page) {
  await page.route("**/data/catalogs/*.json", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    return route.fulfill({
      contentType: "application/json",
      body: readFileSync(join(PINNED_CATALOGS, name)),
    });
  });
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
// browser. Any request to another origin fails the test that caused it, and
// so does anything the built page's Content-Security-Policy blocks.
export const test = base.extend<{ sameOriginOnly: void; noCspViolations: void }>({
  noCspViolations: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        // e2e/ compiles without the DOM lib; this runs in the page.
        type Violation = { violatedDirective: string; blockedURI: string };
        const page = globalThis as unknown as {
          __csp: string[];
          document: { addEventListener(type: string, fn: (e: Violation) => void): void };
        };
        const seen: string[] = [];
        page.__csp = seen;
        page.document.addEventListener("securitypolicyviolation", (e) => {
          seen.push(`${e.violatedDirective} ${e.blockedURI}`);
        });
      });
      await use();
      if (page.isClosed()) return;
      const seen = await page
        .evaluate(() => (globalThis as unknown as { __csp?: string[] }).__csp ?? [])
        .catch(() => []);
      // The PDF renderer's layout engine (yoga) first tries to fetch its
      // WebAssembly from a data: URL; connect-src 'self' blocks that and it
      // decodes the same inline bytes instead. A data: URL can't reach
      // another origin, so this one is expected; anything else fails.
      const unexpected = seen.filter((v) => !/^connect-src data\b/.test(v));
      expect(unexpected, "Content-Security-Policy violations").toEqual([]);
    },
    { auto: true },
  ],
  sameOriginOnly: [
    async ({ page, baseURL }, use) => {
      const base = new URL(baseURL!);
      // What the app itself may request: its bundle, its icon, config.json
      // and one catalog per framework. A page load can be any path (404.html
      // serves deep links), but nothing the app fetches may stray from these,
      // e.g. through a route parameter carrying "../" or "%2F".
      const appPath = new RegExp(
        `^${base.pathname}(assets/[A-Za-z0-9._-]+|favicon\\.svg|config\\.json|data/catalogs/[a-z0-9][a-z0-9_-]*\\.json)$`,
      );
      const foreign: string[] = [];
      const offList: string[] = [];
      page.on("request", (req) => {
        const url = req.url();
        if (url.startsWith("data:") || url.startsWith("blob:")) return;
        const u = new URL(url);
        if (u.origin !== base.origin) foreign.push(url);
        else if (!req.isNavigationRequest() && (u.search !== "" || !appPath.test(u.pathname))) {
          offList.push(url);
        }
      });
      await use();
      expect(foreign, "requests that left the app's origin").toEqual([]);
      expect(offList, "same-origin requests outside the app's own files").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
