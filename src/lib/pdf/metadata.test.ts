import { describe, expect, it } from "vitest";
import { metadataKeywords } from "./metadata";
import type { PdfInput } from "@/types/pdf-input";

const input: PdfInput = {
  evidence_id: "code_of_conduct",
  framework: "soc2",
  control: "CC1.1",
  period: "2026",
  type: "declaration",
  entry_name: "Code of conduct",
  entry_description: "Desc",
  severity: "medium",
  frequency: "yearly",
  completed_by: "Jane Doe",
  completed_at: "2026-10-27T10:00:00.000Z",
  declaration_text: "I confirm.",
  accepted: true,
};

// The keywords string is a cross-repo contract: order, separators and key
// names must not change.
describe("metadataKeywords", () => {
  it("writes the declaration keys in order with accepted last", () => {
    expect(metadataKeywords(input)).toBe(
      "evidence_id=code_of_conduct; framework=soc2; control=CC1.1; period=2026; type=declaration; completed_by=Jane Doe; completed_at=2026-10-27T10:00:00.000Z; accepted=true",
    );
  });

  it("writes accepted=false when the declaration was not accepted", () => {
    expect(metadataKeywords({ ...input, accepted: false })).toMatch(
      /; accepted=false$/,
    );
  });

  it("omits accepted for a checklist", () => {
    expect(
      metadataKeywords({
        ...input,
        type: "checklist",
        accepted: undefined,
        declaration_text: undefined,
        items: [],
      }),
    ).toBe(
      "evidence_id=code_of_conduct; framework=soc2; control=CC1.1; period=2026; type=checklist; completed_by=Jane Doe; completed_at=2026-10-27T10:00:00.000Z",
    );
  });
});
