import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";

// Opens every form link the latest released CLI prints in a failed `check`
// (scripts/collect-form-links.ts writes them; deploy.yml's build job runs it
// and the smoke job hands the file over as E2E_FORM_LINKS). Proves the CLI's
// hardcoded links (manualcatalog.FormURL) land on the right form on the live
// site: the "Form deep link" contract in AGENTS.md.

const linksFile = process.env.E2E_FORM_LINKS;

type FormLink = { framework: string; url: string };

function readLinks(path: string): FormLink[] {
  const raw: unknown = JSON.parse(readFileSync(path, "utf-8"));
  if (!Array.isArray(raw)) throw new Error(`${path}: expected a JSON array`);
  return raw.map((item: unknown, i) => {
    const link = item as Partial<FormLink> | null;
    if (typeof link?.framework !== "string" || typeof link.url !== "string") {
      throw new Error(`${path}[${i}]: expected {framework, url} strings`);
    }
    return { framework: link.framework, url: link.url };
  });
}

// The page titles EvidenceForm.tsx shows instead of a form.
const ERROR_TITLES = ["Evidence entry not found", "Framework not found", "Could not load the catalog"];

// Locally the file is optional; in CI a missing file means the deploy
// wiring broke, so it fails rather than skips.
test.skip(!linksFile && !process.env.CI, "E2E_FORM_LINKS not set (see docs/TESTING.md)");

test("every form link the CLI prints opens its form", async ({ page, baseURL }) => {
  expect(linksFile, "E2E_FORM_LINKS must name the collected links file").toBeTruthy();
  const links = readLinks(linksFile!);
  expect(links.length, "form links in the file").toBeGreaterThan(0);
  test.setTimeout(30_000 + links.length * 10_000);

  const base = baseURL!;
  const basePath = new URL(base).pathname;
  for (const { framework, url } of links) {
    await test.step(url, async () => {
      // The CLI hardcodes the site's address; a link elsewhere is a broken link.
      expect(url.startsWith(base), `${url} starts with ${base}`).toBe(true);
      const parts = /^evidence\/([^/]+)\/([^/]+)$/.exec(new URL(url).pathname.slice(basePath.length));
      expect(parts, `${url} is evidence/<framework>/<id> under the base`).not.toBeNull();
      expect(decodeURIComponent(parts![1]), "framework in the link").toBe(framework);
      const evidenceId = decodeURIComponent(parts![2]);

      await page.goto(url);
      await expect(page.getByRole("button", { name: "Download evidence.pdf" })).toBeVisible();
      const title = (await page.getByRole("heading", { level: 1 }).textContent())?.trim() ?? "";
      expect(ERROR_TITLES, `page title "${title}"`).not.toContain(title);
      // The right form: its upload path is the entry's folder, the one the
      // CLI reported empty. (A phone-only copy of the path stays hidden.)
      const escaped = evidenceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const folder = new RegExp(`(^|/)${escaped}/[^/]+/evidence\\.pdf$`);
      await expect(
        page.locator("code").filter({ hasText: folder, visible: true }).first(),
      ).toBeVisible();
    });
  }
});
