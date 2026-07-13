import { describe, it, expect } from "vitest";
import { computeUploadPath, EVIDENCE_PDF_FILENAME } from "./storage-path";

describe("computeUploadPath", () => {
  it("joins prefix, evidence id, period and filename with no framework segment", () => {
    expect(computeUploadPath("manual-evidence", "code_of_conduct", "2026")).toBe(
      "manual-evidence/code_of_conduct/2026/evidence.pdf",
    );
  });

  it("collapses a trailing slash on the prefix to exactly one separator", () => {
    expect(
      computeUploadPath("manual-evidence/", "code_of_conduct", "2026-Q1"),
    ).toBe("manual-evidence/code_of_conduct/2026-Q1/evidence.pdf");
  });

  it("collapses multiple trailing slashes", () => {
    expect(computeUploadPath("manual///", "id", "2026-03")).toBe(
      "manual/id/2026-03/evidence.pdf",
    );
  });

  it("drops the prefix segment entirely when the prefix is empty", () => {
    expect(computeUploadPath("", "id", "2026-W14")).toBe(
      "id/2026-W14/evidence.pdf",
    );
  });

  it("uses the shared evidence.pdf filename constant", () => {
    expect(computeUploadPath("p", "id", "2026")).toContain(
      EVIDENCE_PDF_FILENAME,
    );
    expect(EVIDENCE_PDF_FILENAME).toBe("evidence.pdf");
  });
});
