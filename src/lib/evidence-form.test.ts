import { describe, expect, it } from "vitest";
import {
  buildPdfInput,
  evidenceFieldErrors,
  initialItems,
  validateEvidence,
} from "./evidence-form";
import type { CatalogEntry } from "@/types/catalog";

const base = {
  control: "CC1.1",
  frequency: "yearly",
  temporal_rule: "retrospective",
  grace_period: "30d",
  description: "Desc",
  severity: "medium",
} as const;

const declaration: CatalogEntry = {
  ...base,
  id: "code_of_conduct",
  type: "declaration",
  name: "Code of conduct",
  declaration_text: "I confirm everyone acknowledged it.",
};

const checklist: CatalogEntry = {
  ...base,
  id: "offboarding",
  type: "checklist",
  name: "Offboarding",
  items: [
    { id: "revoke", text: "Revoke access", required: true },
    { id: "laptop", text: "Collect laptop", required: true },
    { id: "exit", text: "Exit interview", required: false },
  ],
};

const upload: CatalogEntry = {
  ...base,
  id: "training_cert",
  type: "document_upload",
  name: "Training certificate",
};

describe("validateEvidence", () => {
  it("requires a non-blank completed-by first", () => {
    expect(
      validateEvidence(declaration, { completedBy: "  ", accepted: true, items: [] }),
    ).toBe("Completed by is required");
  });

  it("requires the declaration to be accepted", () => {
    expect(
      validateEvidence(declaration, { completedBy: "Jane", accepted: false, items: [] }),
    ).toBe("You must accept the declaration");
    expect(
      validateEvidence(declaration, { completedBy: "Jane", accepted: true, items: [] }),
    ).toBeNull();
  });

  it("names every unticked required checklist item", () => {
    const items = initialItems(checklist);
    expect(
      validateEvidence(checklist, { completedBy: "Jane", accepted: false, items }),
    ).toBe("Required item(s) not checked: revoke, laptop");
  });

  it("passes a checklist with every required item ticked, optional ones open", () => {
    const items = initialItems(checklist).map((i) =>
      i.id === "exit" ? i : { ...i, checked: true },
    );
    expect(
      validateEvidence(checklist, { completedBy: "Jane", accepted: false, items }),
    ).toBeNull();
  });

  it("refuses an entry type the SPA does not render", () => {
    expect(
      validateEvidence(upload, { completedBy: "Jane", accepted: true, items: [] }),
    ).toBe("Unsupported evidence type for SPA rendering");
  });
});

describe("evidenceFieldErrors", () => {
  it("is empty for a complete declaration", () => {
    expect(
      evidenceFieldErrors(declaration, { completedBy: "Jane", accepted: true, items: [] }),
    ).toEqual({});
  });

  it("flags both fields of a blank declaration", () => {
    expect(
      evidenceFieldErrors(declaration, { completedBy: "", accepted: false, items: [] }),
    ).toEqual({
      completedBy: "Enter who completed this",
      attestation: "You must accept the declaration to continue",
    });
  });

  it("flags a checklist with a required item unticked", () => {
    expect(
      evidenceFieldErrors(checklist, {
        completedBy: "Jane",
        accepted: false,
        items: initialItems(checklist),
      }),
    ).toEqual({ attestation: "Tick every required item (marked *)" });
  });
});

describe("initialItems", () => {
  it("starts every catalog item unticked with no notes", () => {
    expect(initialItems(checklist)).toEqual([
      { id: "revoke", checked: false, notes: "" },
      { id: "laptop", checked: false, notes: "" },
      { id: "exit", checked: false, notes: "" },
    ]);
    expect(initialItems(declaration)).toEqual([]);
  });
});

describe("buildPdfInput", () => {
  const completedAt = "2026-10-27T10:00:00.000Z";

  it("maps a declaration and trims completed-by", () => {
    const input = buildPdfInput({
      entry: declaration,
      framework: "soc2",
      periodKey: "2026",
      completedAt,
      state: { completedBy: "  Jane Doe ", accepted: true, items: [] },
    });
    expect(input).toEqual({
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
      completed_at: completedAt,
      declaration_text: "I confirm everyone acknowledged it.",
      accepted: true,
      items: undefined,
    });
  });

  it("maps checklist items with catalog text, required flag and notes", () => {
    const input = buildPdfInput({
      entry: checklist,
      framework: "iso27001",
      periodKey: "2026",
      completedAt,
      state: {
        completedBy: "Jane",
        accepted: false,
        items: [
          { id: "revoke", checked: true, notes: "done in IdP" },
          { id: "laptop", checked: true, notes: "" },
          { id: "exit", checked: false, notes: "" },
          { id: "unknown", checked: true, notes: "" },
        ],
      },
    });
    expect(input.type).toBe("checklist");
    expect(input.declaration_text).toBeUndefined();
    expect(input.accepted).toBeUndefined();
    expect(input.items).toEqual([
      { id: "revoke", text: "Revoke access", required: true, checked: true, notes: "done in IdP" },
      { id: "laptop", text: "Collect laptop", required: true, checked: true, notes: undefined },
      { id: "exit", text: "Exit interview", required: false, checked: false, notes: undefined },
      // An item no longer in the catalog keeps its id as text.
      { id: "unknown", text: "unknown", required: false, checked: true, notes: undefined },
    ]);
  });

  it("throws for an entry type it cannot render", () => {
    expect(() =>
      buildPdfInput({
        entry: upload,
        framework: "soc2",
        periodKey: "2026",
        completedAt,
        state: { completedBy: "Jane", accepted: true, items: [] },
      }),
    ).toThrow(/Unsupported evidence type/);
  });
});
