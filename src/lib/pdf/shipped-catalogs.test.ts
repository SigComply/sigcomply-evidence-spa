import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderEvidencePdf } from "./render";
import { metadataKeywords } from "./metadata";
import {
  joinTextRuns,
  pdfBytesToText,
  readPdfInfoString,
  readPdfTextRuns,
  squashText,
} from "./pdf-info";
import { buildPdfInput, initialItems, validateEvidence } from "@/lib/evidence-form";
import { SPA_RENDERABLE_TYPES } from "@/lib/catalog-validate";
import { currentPeriod } from "@/lib/period";
import type { Catalog, CatalogEntry } from "@/types/catalog";

// public/data/catalogs/, not the pinned e2e copies, on purpose: deploy.yml
// runs this after `npm run build` wrote the latest CLI release's catalogs
// there, so a new or changed CLI entry the form can't turn into a PDF fails
// the deploy instead of reaching users.
const root = join(import.meta.dirname, "..", "..", "..");
const config = JSON.parse(readFileSync(join(root, "public", "config.json"), "utf-8")) as {
  frameworks: string[];
};

function shippedEntries(): [string, CatalogEntry][] {
  return config.frameworks.flatMap((fw) => {
    const catalog = JSON.parse(
      readFileSync(join(root, "public", "data", "catalogs", `${fw}.json`), "utf-8"),
    ) as Catalog;
    return catalog.entries
      .filter((e) => SPA_RENDERABLE_TYPES.has(e.type))
      .map((e): [string, CatalogEntry] => [fw, e]);
  });
}

const entries = shippedEntries();
const NOW = new Date(2026, 4, 15, 12);

describe("every shipped catalog entry", () => {
  it("has entries to check", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries.map(([fw, e]) => [`${fw}/${e.id}`, fw, e] as const))(
    "%s renders a complete form into a PDF",
    async (_name, framework, entry) => {
      const items = initialItems(entry).map((i, n) => ({
        ...i,
        checked: true,
        notes: n === 0 ? "See ticket 42" : "",
      }));
      const state = { completedBy: "Jane Doe", accepted: true, items };
      expect(validateEvidence(entry, state)).toBeNull();

      const period = currentPeriod(entry.frequency, NOW);
      const input = buildPdfInput({
        entry,
        framework,
        periodKey: period.key,
        completedAt: NOW.toISOString(),
        state,
      });
      const bytes = await (await renderEvidencePdf(input)).arrayBuffer();
      const info = pdfBytesToText(bytes);
      expect(readPdfInfoString(info, "Keywords")).toBe(metadataKeywords(input));
      expect(readPdfInfoString(info, "Title")).toBe(entry.name);

      const body = joinTextRuns(readPdfTextRuns(bytes));
      const expected = [
        entry.name,
        `Signed by Jane Doe on ${NOW.toISOString()}`,
        ...(entry.type === "declaration"
          ? [entry.declaration_text ?? "", "Accepted: YES"]
          : (entry.items ?? []).map((i) => i.text)),
      ];
      for (const text of expected) expect(body).toContain(squashText(text));
    },
  );
});
