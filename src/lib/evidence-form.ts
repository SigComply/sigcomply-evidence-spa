import type { CatalogEntry } from "@/types/catalog";
import type { PdfInput } from "@/types/pdf-input";
import { unsupportedPdfChars } from "@/lib/pdf/font-support";

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

function charsMessage(what: string, chars: string[]): string {
  return `${what} has characters the PDF font can’t show: ${chars.join(" ")}`;
}

/** The text fields that reach the PDF, with the characters it can't draw. */
function unsupportedText(
  entry: CatalogEntry,
  state: EvidenceFormState,
): string | null {
  const name = unsupportedPdfChars(state.completedBy);
  if (name.length > 0) return charsMessage("Completed by", name);
  if (entry.type !== "checklist") return null;
  const textById = new Map((entry.items ?? []).map((i) => [i.id, i.text]));
  for (const item of state.items) {
    const chars = unsupportedPdfChars(item.notes);
    if (chars.length > 0) {
      return charsMessage(`The note on “${textById.get(item.id) ?? item.id}”`, chars);
    }
  }
  return null;
}

const UNSUPPORTED = "Unsupported evidence type for SPA rendering";

/** "30d" → "30 days"; any other form is shown as written. */
export function formatGrace(grace: string): string {
  const m = /^(\d+)d$/.exec(grace.trim());
  if (!m) return grace.trim();
  return m[1] === "1" ? "1 day" : `${m[1]} days`;
}

/**
 * The CLI's upload window for an entry: an upload counts from the period's
 * start to its end plus the grace period (isInTemporalWindow in the CLI's
 * manual source). The CLI never branches on `temporal_rule`.
 */
export function uploadWindowText(entry: Pick<CatalogEntry, "grace_period">): string {
  const grace = entry.grace_period ? formatGrace(entry.grace_period) : "";
  if (!grace || /^0 days$/.test(grace)) return "Upload during this period.";
  return `Upload during this period, or up to ${grace} after it ends (the grace period).`;
}

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
    .map((i) => i.text);
}

/** The first blocking problem as one message, or null when the form can submit. */
export function validateEvidence(
  entry: CatalogEntry,
  state: EvidenceFormState,
): string | null {
  if (!state.completedBy.trim()) return "Completed by is required";
  const text = unsupportedText(entry, state);
  if (text) return text;
  if (entry.type === "declaration") {
    return state.accepted ? null : "You must accept the declaration";
  }
  if (entry.type === "checklist") {
    const missing = missingRequired(entry, state.items);
    return missing.length > 0
      ? `Required item(s) not checked: ${missing.map((t) => `“${t}”`).join(", ")}`
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
  const nameChars = unsupportedPdfChars(state.completedBy);
  if (!state.completedBy.trim()) errors.completedBy = "Enter who completed this";
  else if (nameChars.length > 0) errors.completedBy = charsMessage("This name", nameChars);
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
    // NFC, so a name typed as a letter plus a combining accent is drawn and
    // stored as the single character the font check approved.
    completed_by: state.completedBy.trim().normalize("NFC"),
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
              notes: s.notes.normalize("NFC") || undefined,
            };
          })
        : undefined,
  };
}
