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

describe("keyword values", () => {
  it("can't forge a key: ; = and % in a value are percent-encoded", () => {
    const k = metadataKeywords({ ...input, completed_by: "Mallory; period=2025; accepted=true 100%" });
    expect(k).toBe(
      "evidence_id=code_of_conduct; framework=soc2; control=CC1.1; period=2026; type=declaration; completed_by=Mallory%3B period%3D2025%3B accepted%3Dtrue 100%25; completed_at=2026-10-27T10:00:00.000Z; accepted=true",
    );
    const pairs = k.split("; ").map((p) => p.slice(0, p.indexOf("=")));
    expect(pairs.filter((key) => key === "period")).toHaveLength(1);
    expect(pairs.filter((key) => key === "accepted")).toHaveLength(1);
  });

  it("leaves ordinary values, including non-ASCII names, unchanged", () => {
    expect(metadataKeywords({ ...input, completed_by: "Łukasz <l@example.com>" })).toContain(
      "completed_by=Łukasz <l@example.com>; ",
    );
  });
});
