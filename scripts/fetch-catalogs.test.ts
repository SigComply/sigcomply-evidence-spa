import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prepareCatalog } from "./fetch-catalogs.ts";

const catalogsDir = join(import.meta.dirname, "..", "public", "data", "catalogs");

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

  it("is a fixed point on the committed catalogs", () => {
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
