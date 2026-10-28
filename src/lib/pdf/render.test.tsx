import { describe, expect, it } from "vitest";
import { renderEvidencePdf } from "./render";
import { metadataKeywords } from "./metadata";
import { pdfBytesToText, readPdfInfoString, readPdfTextRuns } from "./pdf-info";
import type { PdfInput } from "@/types/pdf-input";

const declaration: PdfInput = {
  evidence_id: "code_of_conduct",
  framework: "soc2",
  control: "CC1.1",
  period: "2026",
  type: "declaration",
  entry_name: "Code of conduct",
  entry_description: "Employees acknowledge the code of conduct.",
  severity: "medium",
  frequency: "yearly",
  completed_by: "Jane Doe",
  completed_at: "2026-10-27T10:00:00.000Z",
  declaration_text: "I confirm everyone acknowledged it.",
  accepted: true,
};

const checklist: PdfInput = {
  ...declaration,
  evidence_id: "offboarding",
  type: "checklist",
  declaration_text: undefined,
  accepted: undefined,
  items: [
    { id: "revoke", text: "Revoke access", required: true, checked: true, notes: "IdP" },
    { id: "exit", text: "Exit interview", required: false, checked: false },
    { id: "badge", text: "Collect badge", required: false, checked: true },
  ],
};

async function pdfText(input: PdfInput): Promise<string> {
  const blob = await renderEvidencePdf(input);
  return pdfBytesToText(await blob.arrayBuffer());
}

async function pdfRuns(input: PdfInput): Promise<string[]> {
  const blob = await renderEvidencePdf(input);
  return readPdfTextRuns(await blob.arrayBuffer());
}

// The checklist box is its own text run, drawn just before the item text;
// the required marker is the run just after it.
function itemRuns(runs: string[], text: string) {
  const i = runs.indexOf(text);
  expect(i, `item "${text}" in the PDF`).toBeGreaterThan(0);
  return { box: runs[i - 1], after: runs[i + 1] };
}

// Not a layout diff: the CLI only hashes the file. The keywords contract
// lives in the Info dictionary; the body is what an auditor reads, so these
// tests check what it says, not how it looks.
describe("renderEvidencePdf", () => {
  it.each([
    ["declaration", declaration],
    ["checklist", checklist],
  ] as const)("renders a %s PDF carrying the keywords string", async (_t, input) => {
    const text = await pdfText(input);
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(readPdfInfoString(text, "Keywords")).toBe(metadataKeywords(input));
    expect(readPdfInfoString(text, "Title")).toBe(input.entry_name);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });
});

describe("Info strings outside ASCII", () => {
  // @react-pdf writes these as UTF-16BE with a byte order mark; catalog
  // names and signers can carry ’, – or accents.
  it("reads back a title and keywords with typographic characters", async () => {
    const input: PdfInput = {
      ...declaration,
      entry_name: "Vendor’s Review – Annual (draft)",
      completed_by: "Zoë Ångström",
    };
    const text = await pdfText(input);
    expect(readPdfInfoString(text, "Title")).toBe(input.entry_name);
    expect(readPdfInfoString(text, "Keywords")).toBe(metadataKeywords(input));
  });
});

describe("PDF body", () => {
  it("states the declaration, the acceptance and who signed it", async () => {
    const runs = await pdfRuns(declaration);
    const text = runs.join("");
    expect(runs[0]).toBe("Code of conduct");
    expect(runs).toContain("I confirm everyone acknowledged it.");
    expect(text).toContain("Accepted: YES");
    expect(text).toContain("Signed by Jane Doe on 2026-10-27T10:00:00.000Z");
    expect(text).toContain("Evidence IDcode_of_conduct");
    expect(text).toContain("Period2026");
  });

  it("says NO when the declaration was not accepted", async () => {
    const text = (await pdfRuns({ ...declaration, accepted: false })).join("");
    expect(text).toContain("Accepted: NO");
    expect(text).not.toContain("Accepted: YES");
  });

  it("marks ticked items, leaves unticked ones blank and stars required ones", async () => {
    const runs = await pdfRuns(checklist);
    expect(itemRuns(runs, "Revoke access")).toEqual({ box: "X", after: " *" });
    expect(itemRuns(runs, "Exit interview").box).toBe(" ");
    expect(itemRuns(runs, "Exit interview").after).not.toBe(" *");
    expect(itemRuns(runs, "Collect badge").box).toBe("X");
    expect(itemRuns(runs, "Collect badge").after).not.toBe(" *");
    const text = runs.join("");
    expect(text).toContain("Notes: IdP");
    expect(text).toContain("Signed by Jane Doe on 2026-10-27T10:00:00.000Z");
    expect(text).not.toContain("Accepted:");
  });
});
