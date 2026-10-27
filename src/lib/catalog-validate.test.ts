import { describe, expect, it } from "vitest";
import { validateCatalog } from "./catalog-validate";
import soc2Raw from "../../public/data/catalogs/soc2.json?raw";
import iso27001Raw from "../../public/data/catalogs/iso27001.json?raw";
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

  it.each(Object.keys(committed))("accepts the committed %s catalog", (fw) => {
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
        entry({
          id: "training",
          type: "document_upload",
          frequency: "monthly",
          items: undefined,
          accepted_formats: ["pdf", "png"],
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
    ["an unknown top-level key", { ...catalog(), extra: 1 }, /catalog: unknown field "extra"/],
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

  it("reports every problem, not just the first", () => {
    const result = validateCatalog(
      catalog([entry({ name: 1, severity: 2 })]),
      "soc2",
    );
    expect(result.errors).toHaveLength(2);
  });
});
