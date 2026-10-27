import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, renderFromInput, type RenderInput } from "./render-evidence-pdf.ts";
import { pdfBytesToText, readPdfInfoString } from "../src/lib/pdf/pdf-info.ts";

const examples = join(import.meta.dirname, "examples");
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "render-pdf-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const declaration: RenderInput = JSON.parse(
  readFileSync(join(examples, "render-evidence-pdf.declaration.json"), "utf-8"),
);

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

  it("renders the checklist example", async () => {
    const input = JSON.parse(
      readFileSync(join(examples, "render-evidence-pdf.checklist.json"), "utf-8"),
    ) as RenderInput;
    const { pdf } = await renderFromInput({ ...input, completed_at: "2026-05-15T12:00:00Z" }, dir);
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
    ["an unknown framework catalog", { framework: "nist" }, /ENOENT/],
    ["a bad date", { completed_at: "yesterday" }, /is not a date/],
    ["a checklist item on a declaration", { checked: ["x"] }, /"x" is not an item/],
  ])("refuses %s", async (_n, over, want) => {
    await expect(renderFromInput({ ...declaration, ...over }, dir)).rejects.toThrow(want);
  });

  it("refuses a checklist with a required item unticked", async () => {
    await expect(
      renderFromInput(
        { framework: "soc2", evidence_id: "incident_response_tested", completed_by: "x", checked: ["plan_tested"] },
        dir,
      ),
    ).rejects.toThrow(/Required item\(s\) not checked: roles_verified, communication_tested/);
  });
});

describe("main", () => {
  it("writes the PDF, prints the upload path and exits 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const out = join(dir, "nested", "evidence.pdf");
    expect(
      await main(["--input", join(examples, "render-evidence-pdf.declaration.json"), "--out", out]),
    ).toBe(0);
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

