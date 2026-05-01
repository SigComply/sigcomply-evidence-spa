import { useState, useCallback } from "react";
import type { CatalogEntry } from "@/types/catalog";
import type { SubmittedEvidence } from "@/types/submitted";
import { currentPeriod } from "@/lib/period";
import { downloadJson } from "@/lib/download";
import { computeUploadPath } from "@/lib/storage-path";
import { getConfig } from "@/config/runtime";

export function useEvidenceForm(entry: CatalogEntry, framework: string) {
  const period = currentPeriod(entry.frequency);

  const [accepted, setAccepted] = useState(false);

  const [completedBy, setCompletedByRaw] = useState(
    () => localStorage.getItem("sigcomply:completed-by") ?? ""
  );

  const setCompletedBy = useCallback((value: string) => {
    setCompletedByRaw(value);
    localStorage.setItem("sigcomply:completed-by", value);
  }, []);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const validate = useCallback((): string | null => {
    if (!completedBy.trim()) return "Completed by is required";
    if (!accepted) return "You must accept the declaration";
    return null;
  }, [completedBy, accepted]);

  const submit = useCallback((): string | null => {
    const error = validate();
    if (error) return error;

    const evidence: SubmittedEvidence = {
      schema_version: "1.0",
      evidence_id: entry.id,
      type: "declaration",
      framework,
      control: entry.control,
      period: period.key,
      completed_by: completedBy.trim(),
      completed_at: new Date().toISOString(),
      declaration_text: entry.declaration_text,
      accepted,
    };

    downloadJson(evidence, "evidence.json");
    setDownloadSuccess(true);
    return null;
  }, [validate, entry, framework, period, completedBy, accepted]);

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
    validate,
    submit,
    downloadSuccess,
    setDownloadSuccess,
    uploadPath,
  };
}
