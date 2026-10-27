import { describe, expect, it } from "vitest";
import { renderEvidencePdf } from "./render";
import { metadataKeywords } from "./metadata";
import { pdfBytesToText, readPdfInfoString } from "./pdf-info";
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
  ],
};

async function pdfText(input: PdfInput): Promise<string> {
  const blob = await renderEvidencePdf(input);
  return pdfBytesToText(await blob.arrayBuffer());
}

// A smoke test, not a layout diff: the CLI only hashes the file, so what
// matters is that a real PDF comes out with the keywords contract in its
// Info dictionary.
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
