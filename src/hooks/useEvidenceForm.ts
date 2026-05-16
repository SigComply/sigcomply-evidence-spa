import { useState, useCallback } from "react";
import type { CatalogEntry } from "@/types/catalog";
import type { PdfInput } from "@/types/pdf-input";
import type { ChecklistItemState } from "@/components/forms/ChecklistForm";
import { currentPeriod } from "@/lib/period";
import {
  computeUploadPath,
  EVIDENCE_PDF_FILENAME,
} from "@/lib/storage-path";
import { downloadBlob } from "@/lib/download";
import { getConfig } from "@/config/runtime";

// useEvidenceForm manages local form state for one catalog entry, validates on
// submit, lazy-loads the PDF renderer, and triggers a browser download of
// `evidence.pdf` that the user uploads to their storage bucket.
//
// Supports two render modes — declaration and checklist — both expressed as
// user attestations. document_upload entries are not handled here; the
// EvidenceForm page guards them with an "uploaded directly" message.
export function useEvidenceForm(entry: CatalogEntry, framework: string) {
  const period = currentPeriod(entry.frequency);

  // Declaration state.
  const [accepted, setAccepted] = useState(false);

  // Checklist state — initialized from the catalog so every item has an entry
  // we can mutate as the user ticks boxes.
  const [items, setItems] = useState<ChecklistItemState[]>(() =>
    (entry.items ?? []).map((i) => ({ id: i.id, checked: false, notes: "" }))
  );
  const setItem = useCallback(
    (id: string, patch: Partial<ChecklistItemState>) => {
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
      );
    },
    []
  );

  const [completedBy, setCompletedByRaw] = useState(
    () => localStorage.getItem("sigcomply:completed-by") ?? ""
  );
  const setCompletedBy = useCallback((value: string) => {
    setCompletedByRaw(value);
    localStorage.setItem("sigcomply:completed-by", value);
  }, []);

  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // `attempted` flips on the first submit press so inline field errors only
  // appear after the user has tried, not on a pristine form. The errors
  // themselves are derived every render so they clear as the user fixes them.
  const [attempted, setAttempted] = useState(false);

  const fieldErrors = (() => {
    const errors: { completedBy?: string; attestation?: string } = {};
    if (!completedBy.trim()) errors.completedBy = "Enter who completed this";
    if (entry.type === "declaration") {
      if (!accepted)
        errors.attestation = "You must accept the declaration to continue";
    } else if (entry.type === "checklist") {
      const requiredIds = (entry.items ?? [])
        .filter((i) => i.required)
        .map((i) => i.id);
      const checkedIds = new Set(
        items.filter((i) => i.checked).map((i) => i.id),
      );
      if (requiredIds.some((id) => !checkedIds.has(id)))
        errors.attestation = "Tick every required item (marked *)";
    }
    return errors;
  })();

  const validate = useCallback((): string | null => {
    if (!completedBy.trim()) return "Completed by is required";

    if (entry.type === "declaration") {
      if (!accepted) return "You must accept the declaration";
      return null;
    }

    if (entry.type === "checklist") {
      const requiredIds = (entry.items ?? [])
        .filter((i) => i.required)
        .map((i) => i.id);
      const checkedIds = new Set(
        items.filter((i) => i.checked).map((i) => i.id)
      );
      const missing = requiredIds.filter((id) => !checkedIds.has(id));
      if (missing.length > 0) {
        return `Required item(s) not checked: ${missing.join(", ")}`;
      }
      return null;
    }

    return "Unsupported evidence type for SPA rendering";
  }, [completedBy, accepted, items, entry]);

  const submit = useCallback(async (): Promise<string | null> => {
    setAttempted(true);
    const error = validate();
    if (error) return error;
    if (entry.type !== "declaration" && entry.type !== "checklist") {
      return "Unsupported evidence type for SPA rendering";
    }

    setSubmitting(true);
    try {
      const completedAt = new Date().toISOString();

      const catalogItemsByID = new Map(
        (entry.items ?? []).map((i) => [i.id, i])
      );

      const input: PdfInput = {
        evidence_id: entry.id,
        framework,
        control: entry.control,
        period: period.key,
        type: entry.type,
        entry_name: entry.name,
        entry_description: entry.description,
        severity: entry.severity,
        frequency: entry.frequency,
        completed_by: completedBy.trim(),
        completed_at: completedAt,
        declaration_text:
          entry.type === "declaration" ? entry.declaration_text : undefined,
        accepted: entry.type === "declaration" ? accepted : undefined,
        items:
          entry.type === "checklist"
            ? items.map((s) => {
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

      // Lazy-load @react-pdf/renderer behind the form-submit handler so the
      // dashboard route stays light.
      const { renderEvidencePdf } = await import("@/lib/pdf/render");
      const blob = await renderEvidencePdf(input);
      downloadBlob(blob, EVIDENCE_PDF_FILENAME);

      setDownloadSuccess(true);
      return null;
    } catch (err) {
      return err instanceof Error
        ? err.message
        : "Failed to render PDF";
    } finally {
      setSubmitting(false);
    }
  }, [validate, entry, framework, period, completedBy, accepted, items]);

  const config = getConfig();
  const uploadPath = computeUploadPath(
    config.storage.prefix,
    framework,
    entry.id,
    period.key
  );

  return {
    period,
    completedBy,
    setCompletedBy,
    accepted,
    setAccepted,
    items,
    setItem,
    validate,
    submit,
    submitting,
    attempted,
    fieldErrors,
    downloadSuccess,
    setDownloadSuccess,
    uploadPath,
  };
}
