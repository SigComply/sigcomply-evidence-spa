import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prepareCatalog } from "./fetch-catalogs.ts";
import { validateCatalog } from "../src/lib/catalog-validate.ts";

// public/data/catalogs/, not the pinned e2e copies: in deploy.yml this runs
// after `npm run build` wrote the latest CLI's catalogs there, so it is the
// deploy-time check that the fresh catalogs pass the validator unchanged.
const catalogsDir = join(import.meta.dirname, "..", "public", "data", "catalogs");
// The CLI's catalog goldens (sigcomply-cli internal/manualcatalog/testdata/,
// exactly what `sigcomply evidence catalog -o json` prints), copied byte for
// byte; scripts/check-goldens.sh catches drift.
const goldenDir = join(import.meta.dirname, "..", "src", "lib", "__fixtures__", "golden");

afterEach(() => vi.restoreAllMocks());

function cliOutput(entries: unknown[]): string {
  return JSON.stringify({ framework: "soc2", version: "1.0", entries });
}

const decl = {
  id: "policy_ack",
  control: "CC1.1",
  type: "declaration",
  frequency: "yearly",
  temporal_rule: "retrospective",
  grace_period: "30d",
  name: "Policy acknowledgment",
  description: "d",
  severity: "medium",
  declaration_text: "I confirm.",
};

describe("prepareCatalog", () => {
  it("drops document_upload entries and counts them", () => {
    const upload = { ...decl, id: "cert", type: "document_upload", declaration_text: undefined, accepted_formats: ["pdf"] };
    const { catalog, before, after } = prepareCatalog(cliOutput([decl, upload]), "soc2");
    expect([before, after]).toEqual([2, 1]);
    expect(catalog.entries.map((e) => e.id)).toEqual(["policy_ack"]);
    expect(Object.keys(catalog)).toEqual(["framework", "version", "entries"]);
  });

  it("only warns about unknown fields on a dropped entry or at the top level", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const upload = { id: "cert", type: "document_upload", owner: "it" };
    const json = JSON.stringify({ framework: "soc2", version: "1.0", generated_at: "x", entries: [decl, upload] });
    const { catalog, before, after } = prepareCatalog(json, "soc2");
    expect([before, after]).toEqual([2, 1]);
    expect(Object.keys(catalog)).toEqual(["framework", "version", "entries"]);
    expect(warn.mock.calls.flat().join("\n")).toMatch(
      /soc2 catalog:[\s\S]*catalog: unknown field "generated_at"[\s\S]*entries\[1\] \(document_upload, dropped\): unknown field "owner"/,
    );
  });

  it("is a fixed point on the catalogs in public/data/catalogs", () => {
    for (const fw of ["soc2", "iso27001"]) {
      const text = readFileSync(join(catalogsDir, `${fw}.json`), "utf-8");
      const { catalog } = prepareCatalog(text, fw);
      expect(JSON.stringify(catalog, null, 2) + "\n").toBe(text);
    }
  });

  it("fails on malformed JSON", () => {
    expect(() => prepareCatalog("{", "soc2")).toThrow(/emitted malformed JSON/);
  });

  it("fails with every shape error when the CLI output drifts", () => {
    expect(() =>
      prepareCatalog(cliOutput([{ ...decl, frequency: "annual", owner: "x" }]), "soc2"),
    ).toThrow(/does not match src\/types\/catalog\.ts[\s\S]*unknown field "owner"[\s\S]*frequency/);
  });
});

describe("CLI catalog goldens", () => {
  it.each(["soc2", "iso27001"])("%s passes the validator with no errors or warnings", (fw) => {
    const text = readFileSync(join(goldenDir, `${fw}_golden.json`), "utf-8");
    const raw = JSON.parse(text) as { entries: { type: string }[] };
    const result = validateCatalog(raw, fw);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);

    const { catalog, before, after } = prepareCatalog(text, fw);
    const renderable = raw.entries.filter((e) => e.type !== "document_upload").length;
    expect(before).toBe(raw.entries.length);
    expect(after).toBe(renderable);
    expect(after).toBeGreaterThan(0);
    expect(catalog.framework).toBe(fw);
  });
});
