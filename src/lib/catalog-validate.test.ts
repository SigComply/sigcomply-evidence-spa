import { describe, expect, it } from "vitest";
import { validateCatalog } from "./catalog-validate";
// The pinned copies under e2e/fixtures/catalogs/, not public/data/catalogs/:
// deploy.yml's `npm run build` overwrites public/data/catalogs/ with the
// latest CLI's catalogs before these tests run. scripts/fetch-catalogs.test.ts
// checks the fresh ones.
import soc2Raw from "../../e2e/fixtures/catalogs/soc2.json?raw";
import iso27001Raw from "../../e2e/fixtures/catalogs/iso27001.json?raw";
import publicConfigRaw from "../../public/config.json?raw";

const committed: Record<string, string> = { soc2: soc2Raw, iso27001: iso27001Raw };

function entry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "offboarding",
    control: "CC6.2",
    type: "checklist",
    frequency: "quarterly",
    temporal_rule: "retrospective",
    grace_period: "15d",
    name: "Offboarding",
    description: "Access removed on exit.",
    severity: "high",
    items: [{ id: "revoke", text: "Revoke access", required: true }],
    ...over,
  };
}

function catalog(entries: unknown[] = [entry()]): Record<string, unknown> {
  return { framework: "soc2", version: "1.0", entries };
}

describe("validateCatalog", () => {
  it("covers every framework in public/config.json", () => {
    const { frameworks } = JSON.parse(publicConfigRaw) as { frameworks: string[] };
    expect(Object.keys(committed).sort()).toEqual([...frameworks].sort());
  });

  it.each(Object.keys(committed))("accepts the pinned %s catalog", (fw) => {
    const result = validateCatalog(JSON.parse(committed[fw]), fw);
    expect(result.errors).toEqual([]);
    expect(result.catalog?.framework).toBe(fw);
  });

  it("accepts every optional field the CLI can emit", () => {
    const result = validateCatalog(
      catalog([
        entry({ category: "access", tsc: "security", optional: true }),
        entry({
          id: "policy_ack",
          type: "declaration",
          frequency: "yearly",
          temporal_rule: "anytime",
          items: undefined,
          declaration_text: "I confirm.",
        }),
        entry({ id: "d", frequency: "daily" }),
        entry({ id: "w", frequency: "weekly" }),
      ]),
      "soc2",
    );
    expect(result.errors).toEqual([]);
  });

  it.each<[string, unknown, RegExp]>([
    ["a non-object", [], /catalog: expected an object/],
    ["a missing version", { framework: "soc2", entries: [] }, /catalog\.version: expected a string/],
    ["entries not an array", { framework: "soc2", version: "1", entries: null }, /catalog\.entries: expected an array/],
    ["the wrong framework", { ...catalog(), framework: "iso27001" }, /catalog\.framework: expected "soc2", got "iso27001"/],
    ["an unknown type", catalog([entry({ type: "upload" })]), /entries\[0\]\.type: expected one of/],
    ["the CLI's internal 'annual' frequency", catalog([entry({ frequency: "annual" })]), /entries\[0\]\.frequency: expected one of/],
    ["an unknown temporal_rule", catalog([entry({ temporal_rule: "later" })]), /entries\[0\]\.temporal_rule: expected one of/],
    ["a missing name", catalog([entry({ name: undefined })]), /entries\[0\]\.name: expected a string/],
    ["a numeric severity", catalog([entry({ severity: 3 })]), /entries\[0\]\.severity: expected a string/],
    ["a non-boolean optional", catalog([entry({ optional: "yes" })]), /entries\[0\]\.optional: expected a boolean/],
    ["accepted_formats with a number", catalog([entry({ accepted_formats: ["pdf", 1] })]), /entries\[0\]\.accepted_formats\[1\]: expected a string/],
    ["an item without required", catalog([entry({ items: [{ id: "a", text: "A" }] })]), /entries\[0\]\.items\[0\]\.required: expected a boolean/],
    ["an item with an unknown key", catalog([entry({ items: [{ id: "a", text: "A", required: true, hint: "x" }] })]), /entries\[0\]\.items\[0\]: unknown field "hint"/],
    ["an unknown entry key", catalog([entry({ owner: "it" })]), /entries\[0\]: unknown field "owner"/],
    ["a duplicate id", catalog([entry(), entry()]), /entries\[1\]\.id: duplicate "offboarding"/],
  ])("rejects %s", (_name, raw, want) => {
    const result = validateCatalog(raw, "soc2");
    expect(result.catalog).toBeUndefined();
    expect(result.errors.join("\n")).toMatch(want);
  });

  it("drops the entries the SPA does not render and counts them", () => {
    const result = validateCatalog(
      catalog([
        entry(),
        entry({
          id: "training",
          type: "document_upload",
          items: undefined,
          accepted_formats: ["pdf", "png"],
        }),
      ]),
      "soc2",
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.dropped).toBe(1);
    expect(result.catalog?.entries.map((e) => e.id)).toEqual(["offboarding"]);
  });

  it("only warns about unknown or malformed fields on dropped entries", () => {
    const result = validateCatalog(
      catalog([
        entry(),
        // A new CLI field on an entry the SPA never shows must not turn the
        // deploy red; a missing name does not matter either.
        { id: "cert", type: "document_upload", owner: "it", name: 3 },
      ]),
      "soc2",
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(['entries[1] (document_upload, dropped): unknown field "owner"']);
    expect(result.catalog?.entries).toHaveLength(1);
  });

  it("only warns about an unknown top-level field, which the SPA never reads", () => {
    const result = validateCatalog({ ...catalog(), generated_at: "2026-10-01" }, "soc2");
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(['catalog: unknown field "generated_at"']);
    expect(Object.keys(result.catalog!)).toEqual(["framework", "version", "entries"]);
  });

  it("still fails an unknown field on an entry the SPA renders", () => {
    const result = validateCatalog(
      catalog([entry({ type: "declaration", items: undefined, declaration_text: "x", owner: "it" })]),
      "soc2",
    );
    expect(result.catalog).toBeUndefined();
    expect(result.errors).toEqual(['entries[0]: unknown field "owner"']);
  });

  it("reports every problem, not just the first", () => {
    const result = validateCatalog(
      catalog([entry({ name: 1, severity: 2 })]),
      "soc2",
    );
    expect(result.errors).toHaveLength(2);
  });
});
