import type { CatalogEntry } from "@/types/catalog";
import type { PdfInput } from "@/types/pdf-input";

// Pure form logic behind useEvidenceForm: validation and the mapping from
// form state to the PDF input. Kept out of the hook so it can be tested
// without React, and reused by scripts/render-evidence-pdf.ts.

export interface ChecklistItemState {
  id: string;
  checked: boolean;
  notes: string;
}

export interface EvidenceFormState {
  completedBy: string;
  accepted: boolean;
  items: ChecklistItemState[];
}

export interface EvidenceFieldErrors {
  completedBy?: string;
  attestation?: string;
}

const UNSUPPORTED = "Unsupported evidence type for SPA rendering";

export function initialItems(entry: CatalogEntry): ChecklistItemState[] {
  return (entry.items ?? []).map((i) => ({ id: i.id, checked: false, notes: "" }));
}

function missingRequired(
  entry: CatalogEntry,
  items: ChecklistItemState[],
): string[] {
  const checked = new Set(items.filter((i) => i.checked).map((i) => i.id));
  return (entry.items ?? [])
    .filter((i) => i.required && !checked.has(i.id))
    .map((i) => i.id);
}

/** The first blocking problem as one message, or null when the form can submit. */
export function validateEvidence(
  entry: CatalogEntry,
  state: EvidenceFormState,
): string | null {
  if (!state.completedBy.trim()) return "Completed by is required";
  if (entry.type === "declaration") {
    return state.accepted ? null : "You must accept the declaration";
  }
  if (entry.type === "checklist") {
    const missing = missingRequired(entry, state.items);
    return missing.length > 0
      ? `Required item(s) not checked: ${missing.join(", ")}`
      : null;
  }
  return UNSUPPORTED;
}

/** Inline, per-field messages shown once the user has tried to submit. */
export function evidenceFieldErrors(
  entry: CatalogEntry,
  state: EvidenceFormState,
): EvidenceFieldErrors {
  const errors: EvidenceFieldErrors = {};
  if (!state.completedBy.trim()) errors.completedBy = "Enter who completed this";
  if (entry.type === "declaration" && !state.accepted) {
    errors.attestation = "You must accept the declaration to continue";
  } else if (
    entry.type === "checklist" &&
    missingRequired(entry, state.items).length > 0
  ) {
    errors.attestation = "Tick every required item (marked *)";
  }
  return errors;
}

export function buildPdfInput(args: {
  entry: CatalogEntry;
  framework: string;
  periodKey: string;
  completedAt: string;
  state: EvidenceFormState;
}): PdfInput {
  const { entry, framework, periodKey, completedAt, state } = args;
  if (entry.type !== "declaration" && entry.type !== "checklist") {
    throw new Error(UNSUPPORTED);
  }
  const catalogItemsByID = new Map((entry.items ?? []).map((i) => [i.id, i]));
  return {
    evidence_id: entry.id,
    framework,
    control: entry.control,
    period: periodKey,
    type: entry.type,
    entry_name: entry.name,
    entry_description: entry.description,
    severity: entry.severity,
    frequency: entry.frequency,
    completed_by: state.completedBy.trim(),
    completed_at: completedAt,
    declaration_text:
      entry.type === "declaration" ? entry.declaration_text : undefined,
    accepted: entry.type === "declaration" ? state.accepted : undefined,
    items:
      entry.type === "checklist"
        ? state.items.map((s) => {
            const c = catalogItemsByID.get(s.id);
            return {
              id: s.id,
              text: c?.text ?? s.id,
              required: Boolean(c?.required),
              checked: s.checked,
              notes: s.notes || undefined,
            };
          })
        : undefined,
  };
}
