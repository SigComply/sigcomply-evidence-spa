import { useState, useCallback } from "react";
import type { CatalogEntry } from "@/types/catalog";
import {
  buildPdfInput,
  evidenceFieldErrors,
  initialItems,
  validateEvidence,
  type ChecklistItemState,
} from "@/lib/evidence-form";
import { readPref, writePref } from "@/lib/local-prefs";
import { currentPeriod, type Period } from "@/lib/period";
import {
  computeUploadPath,
  EVIDENCE_PDF_FILENAME,
} from "@/lib/storage-path";
import { downloadBlob } from "@/lib/download";
import { markGenerated } from "@/lib/device-memory";
import { getConfig } from "@/config/runtime";

const COMPLETED_BY_KEY = "sigcomply:completed-by";

// useEvidenceForm manages local form state for one catalog entry, validates on
// submit, lazy-loads the PDF renderer, and triggers a browser download of
// `evidence.pdf` that the user uploads to their storage bucket.
//
// Supports two render modes — declaration and checklist — both expressed as
// user attestations. document_upload entries are not handled here; the
// EvidenceForm page guards them with an "uploaded directly" message.
export function useEvidenceForm(entry: CatalogEntry, framework: string) {
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  // The period the downloaded PDF names. The upload screen shows its folder,
  // not the period at the latest render, so the two can't split when a
  // boundary passes while the PDF renders or the screen stays open.
  const [downloadedPeriod, setDownloadedPeriod] = useState<Period | null>(null);
  const period =
    downloadSuccess && downloadedPeriod
      ? downloadedPeriod
      : currentPeriod(entry.frequency);

  // Declaration state.
  const [accepted, setAccepted] = useState(false);

  // Checklist state — initialized from the catalog so every item has an entry
  // we can mutate as the user ticks boxes.
  const [items, setItems] = useState<ChecklistItemState[]>(() =>
    initialItems(entry)
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
    () => readPref(COMPLETED_BY_KEY) ?? ""
  );
  const setCompletedBy = useCallback((value: string) => {
    setCompletedByRaw(value);
    writePref(COMPLETED_BY_KEY, value);
  }, []);

  const [submitting, setSubmitting] = useState(false);

  // `attempted` flips on the first submit press so inline field errors only
  // appear after the user has tried, not on a pristine form. The errors
  // themselves are derived every render so they clear as the user fixes them.
  const [attempted, setAttempted] = useState(false);

  const fieldErrors = evidenceFieldErrors(entry, { completedBy, accepted, items });

  const validate = useCallback(
    (): string | null =>
      validateEvidence(entry, { completedBy, accepted, items }),
    [completedBy, accepted, items, entry],
  );

  // submit resolves to an error only for a failure no field carries (a render
  // failure). A validation problem is shown beside its field and clears as the
  // user fixes it, so returning it here would leave a stale copy on the page.
  const submit = useCallback(async (): Promise<string | null> => {
    setAttempted(true);
    if (validate()) return null;

    setSubmitting(true);
    try {
      // Read the clock once: the period is the entry's period at completed_at,
      // as the CLI and render-evidence-pdf derive it. The period from the last
      // render may be stale if a boundary passed before the click.
      const now = new Date();
      const submitted = currentPeriod(entry.frequency, now);
      const input = buildPdfInput({
        entry,
        framework,
        periodKey: submitted.key,
        completedAt: now.toISOString(),
        state: { completedBy, accepted, items },
      });

      // Lazy-load @react-pdf/renderer behind the form-submit handler so the
      // dashboard route stays light.
      const { renderEvidencePdf } = await import("@/lib/pdf/render");
      const blob = await renderEvidencePdf(input);
      downloadBlob(blob, EVIDENCE_PDF_FILENAME);

      // Local-only breadcrumb (this browser): never authoritative status.
      markGenerated(framework, entry.id, submitted.key);

      setDownloadedPeriod(submitted);
      setDownloadSuccess(true);
      return null;
    } catch (err) {
      return err instanceof Error
        ? err.message
        : "Couldn’t create the PDF. Try again.";
    } finally {
      setSubmitting(false);
    }
  }, [validate, entry, framework, completedBy, accepted, items]);

  const config = getConfig();
  const uploadPath = computeUploadPath(
    config.storage.prefix,
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
