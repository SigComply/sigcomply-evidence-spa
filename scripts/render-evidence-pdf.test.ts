import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, renderFromInput, type RenderInput } from "./render-evidence-pdf.ts";
import { pdfBytesToText, readPdfInfoString } from "../src/lib/pdf/pdf-info.ts";

const examples = join(import.meta.dirname, "examples");
// The pinned catalog, not the default public/data/catalogs/soc2.json: in
// deploy.yml these tests run after `npm run build` refreshed that file from
// the latest CLI, which may no longer carry the entries the examples name.
const pinnedSoc2 = join(import.meta.dirname, "..", "e2e", "fixtures", "catalogs", "soc2.json");
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "render-pdf-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const declaration: RenderInput = {
  ...JSON.parse(readFileSync(join(examples, "render-evidence-pdf.declaration.json"), "utf-8")),
  catalog: pinnedSoc2,
};

describe("renderFromInput", () => {
  it("renders the declaration example with the form's keywords", async () => {
    const { pdf, uploadPath, period } = await renderFromInput(declaration, dir);
    const text = pdfBytesToText(pdf);
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(period).toBe("2026");
    expect(uploadPath).toBe("manual/code_of_conduct_acknowledgment/2026/evidence.pdf");
    expect(readPdfInfoString(text, "Keywords")).toBe(
      "evidence_id=code_of_conduct_acknowledgment; framework=soc2; control=CC1.1; period=2026; type=declaration; completed_by=E2E Bot <e2e@example.com>; completed_at=2026-05-15T12:00:00Z; accepted=true",
    );
  });

  it("takes the period from completed_at in UTC, whatever the machine's zone", async () => {
    const saved = process.env.TZ;
    process.env.TZ = "Australia/Sydney";
    try {
      // Already 2027 in Sydney, still 2026 in UTC and for the CLI.
      const r = await renderFromInput({ ...declaration, completed_at: "2026-12-31T22:00:00Z" }, dir);
      expect(r.period).toBe("2026");
      expect(r.uploadPath).toBe("manual/code_of_conduct_acknowledgment/2026/evidence.pdf");
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });

  it("refuses a name the PDF font can't draw, like the form", async () => {
    await expect(
      renderFromInput({ ...declaration, completed_by: "张伟" }, dir),
    ).rejects.toThrow("Completed by has characters the PDF font can’t show: 张 伟");
  });

  it("renders the checklist example", async () => {
    const input = JSON.parse(
      readFileSync(join(examples, "render-evidence-pdf.checklist.json"), "utf-8"),
    ) as RenderInput;
    const { pdf } = await renderFromInput(
      { ...input, completed_at: "2026-05-15T12:00:00Z", catalog: pinnedSoc2 },
      dir,
    );
    const keywords = readPdfInfoString(pdfBytesToText(pdf), "Keywords");
    expect(keywords).toMatch(/^evidence_id=incident_response_tested; .*type=checklist; /);
    expect(keywords).not.toContain("accepted=");
  });

  it("honours period, prefix and a catalog path", async () => {
    const catalog = {
      framework: "soc2",
      version: "1",
      entries: [
        {
          id: "weekly_check",
          control: "C",
          type: "declaration",
          frequency: "weekly",
          temporal_rule: "anytime",
          grace_period: "1d",
          name: "Weekly",
          description: "d",
          severity: "low",
          declaration_text: "ok",
        },
      ],
    };
    writeFileSync(join(dir, "cat.json"), JSON.stringify(catalog));
    const r = await renderFromInput(
      {
        framework: "soc2",
        evidence_id: "weekly_check",
        completed_by: "x",
        accepted: true,
        completed_at: "2026-05-15T12:00:00Z",
        period: "2026-W20",
        prefix: "evidence/manual",
        catalog: "cat.json",
      },
      dir,
    );
    expect(r.uploadPath).toBe("evidence/manual/weekly_check/2026-W20/evidence.pdf");
  });

  it.each<[string, Partial<RenderInput>, RegExp]>([
    ["an unaccepted declaration", { accepted: false }, /You must accept the declaration/],
    ["an unknown entry", { evidence_id: "nope" }, /no entry "nope"/],
    ["a missing catalog file", { framework: "nist", catalog: "nist.json" }, /ENOENT/],
    ["a framework without a shipped catalog", { framework: "nist", catalog: undefined }, /input\.framework "nist" is not in public\/config\.json \(soc2, iso27001\)/],
    ["a framework that is not a plain name", { framework: "../soc2", catalog: undefined }, /input\.framework must match/],
    ["a bad date", { completed_at: "yesterday" }, /is not a date/],
    ["a checklist item on a declaration", { checked: ["x"] }, /"x" is not an item/],
    ["checked that is not an array", { checked: "plan_tested" as never }, /input\.checked must be an array of strings/],
    ["checked with a number", { checked: [1] as never }, /input\.checked must be an array of strings/],
    ["notes that is not an object", { notes: "n" as never }, /input\.notes must be an object of strings/],
    ["a note that is not a string", { notes: { a: 1 } as never }, /input\.notes must be an object of strings/],
    ["a note for an unknown item", { notes: { x: "n" } }, /notes: "x" is not an item/],
    ["accepted that is not a boolean", { accepted: "yes" as never }, /input\.accepted must be a boolean/],
    ["a period in another format", { period: "2026-Q2" }, /input\.period "2026-Q2" is not a yearly period \(YYYY\)/],
    ["a path-like period", { period: "../2026" }, /is not a yearly period/],
    ["a prefix that is not a string", { prefix: 3 as never }, /input\.prefix must be a string/],
    ["an unknown field", { complete_by: "x" } as never, /input: unknown field "complete_by"/],
  ])("refuses %s", async (_n, over, want) => {
    await expect(renderFromInput({ ...declaration, ...over }, dir)).rejects.toThrow(want);
  });

  it.each<[string, string, string]>([
    ["daily", "2026-05-15", "2026-5-15"],
    ["weekly", "2026-W20", "2026-W5"],
    ["monthly", "2026-05", "2026-5"],
    ["quarterly", "2026-Q2", "2026-Q5"],
    ["yearly", "2026", "FY2026"],
  ])("checks a %s period's format", async (frequency, good, bad) => {
    const catalog = {
      framework: "soc2",
      version: "1",
      entries: [
        {
          id: "e",
          control: "C",
          type: "declaration",
          frequency,
          temporal_rule: "anytime",
          grace_period: "1d",
          name: "E",
          description: "d",
          severity: "low",
          declaration_text: "ok",
        },
      ],
    };
    writeFileSync(join(dir, "cat.json"), JSON.stringify(catalog));
    const input: RenderInput = {
      framework: "soc2",
      evidence_id: "e",
      completed_by: "x",
      accepted: true,
      catalog: "cat.json",
    };
    await expect(renderFromInput({ ...input, period: good }, dir)).resolves.toMatchObject({ period: good });
    await expect(renderFromInput({ ...input, period: bad }, dir)).rejects.toThrow(
      new RegExp(`input\\.period "${bad}" is not a ${frequency} period`),
    );
  });

  it("refuses a checklist with a required item unticked", async () => {
    await expect(
      renderFromInput(
        {
          framework: "soc2",
          evidence_id: "incident_response_tested",
          completed_by: "x",
          checked: ["plan_tested"],
          catalog: pinnedSoc2,
        },
        dir,
      ),
    ).rejects.toThrow(/Required item\(s\) not checked: roles_verified, communication_tested/);
  });
});

describe("main", () => {
  it("writes the PDF, prints the upload path and exits 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const out = join(dir, "nested", "evidence.pdf");
    writeFileSync(join(dir, "in.json"), JSON.stringify(declaration));
    expect(await main(["--input", join(dir, "in.json"), "--out", out])).toBe(0);
    expect(readFileSync(out).subarray(0, 5).toString()).toBe("%PDF-");
    expect(log).toHaveBeenCalledWith("manual/code_of_conduct_acknowledgment/2026/evidence.pdf");
    const kw = readPdfInfoString(pdfBytesToText(readFileSync(out)), "Keywords");
    expect(kw).toContain("completed_by=E2E Bot <e2e@example.com>");
  });

  it("exits 1 with a message on bad arguments or input", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await main(["--input", "x.json"])).toBe(1);
    expect(err).toHaveBeenLastCalledWith(expect.stringMatching(/usage: render-evidence-pdf/));
    writeFileSync(join(dir, "bad.json"), JSON.stringify({ framework: "soc2" }));
    expect(await main(["--input", join(dir, "bad.json"), "--out", join(dir, "o.pdf")])).toBe(1);
    expect(err).toHaveBeenLastCalledWith(expect.stringMatching(/input\.evidence_id must be/));
    writeFileSync(join(dir, "arr.json"), "[]");
    expect(await main(["--input", join(dir, "arr.json"), "--out", join(dir, "o.pdf")])).toBe(1);
  });
});

