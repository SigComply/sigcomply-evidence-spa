import { useState, useCallback } from "react";
import type { CatalogEntry } from "@/types/catalog";
import type { SubmittedEvidence, SubmittedChecklistItem } from "@/types/submitted";
import { currentPeriod } from "@/lib/period";
import { downloadJson } from "@/lib/download";
import { computeUploadPath } from "@/lib/storage-path";
import { getConfig } from "@/config/runtime";

interface ChecklistState {
  items: Record<string, { checked: boolean; notes: string }>;
}

interface DeclarationState {
  accepted: boolean;
}

export function useEvidenceForm(entry: CatalogEntry, framework: string) {
  const period = currentPeriod(entry.frequency);

  // Checklist state
  const [checklistState, setChecklistState] = useState<ChecklistState>(() => {
    const items: ChecklistState["items"] = {};
    if (entry.items) {
      for (const item of entry.items) {
        items[item.id] = { checked: false, notes: "" };
      }
    }
    return { items };
  });

  // Declaration state
  const [declarationState, setDeclarationState] = useState<DeclarationState>({
    accepted: false,
  });

  const [completedBy, setCompletedBy] = useState("");
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const setChecklistItem = useCallback(
    (id: string, checked: boolean) => {
      setChecklistState((s) => ({
        items: { ...s.items, [id]: { ...s.items[id], checked } },
      }));
    },
    []
  );

  const setChecklistNotes = useCallback(
    (id: string, notes: string) => {
      setChecklistState((s) => ({
        items: { ...s.items, [id]: { ...s.items[id], notes } },
      }));
    },
    []
  );

  const setAccepted = useCallback((accepted: boolean) => {
    setDeclarationState({ accepted });
  }, []);

  const validate = useCallback((): string | null => {
    if (!completedBy.trim()) return "Completed by is required";

    switch (entry.type) {
      case "checklist":
        if (entry.items) {
          for (const item of entry.items) {
            if (item.required && !checklistState.items[item.id]?.checked) {
              return `Required checklist item not checked: ${item.text}`;
            }
          }
        }
        break;
      case "declaration":
        if (!declarationState.accepted)
          return "You must accept the declaration";
        break;
    }
    return null;
  }, [entry, completedBy, checklistState, declarationState]);

  const submit = useCallback((): string | null => {
    const error = validate();
    if (error) return error;

    const evidence: SubmittedEvidence = {
      schema_version: "1.0",
      evidence_id: entry.id,
      type: entry.type,
      framework,
      control: entry.control,
      period: period.key,
      completed_by: completedBy.trim(),
      completed_at: new Date().toISOString(),
    };

    switch (entry.type) {
      case "checklist":
        evidence.items = Object.entries(checklistState.items).map(
          ([id, state]): SubmittedChecklistItem => ({
            id,
            checked: state.checked,
            ...(state.notes ? { notes: state.notes } : {}),
          })
        );
        break;
      case "declaration":
        evidence.declaration_text = entry.declaration_text;
        evidence.accepted = declarationState.accepted;
        break;
    }

    downloadJson(evidence, "evidence.json");
    setDownloadSuccess(true);
    return null;
  }, [
    validate,
    entry,
    framework,
    period,
    completedBy,
    checklistState,
    declarationState,
  ]);

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
    // Checklist
    checklistItems: checklistState.items,
    setChecklistItem,
    setChecklistNotes,
    // Declaration
    accepted: declarationState.accepted,
    setAccepted,
    // Actions
    validate,
    submit,
    downloadSuccess,
    setDownloadSuccess,
    uploadPath,
  };
}
