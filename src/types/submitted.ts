import type { EvidenceType } from "./catalog";

export interface SubmittedChecklistItem {
  id: string;
  checked: boolean;
  notes?: string;
}

export interface SubmittedEvidence {
  schema_version: string;
  evidence_id: string;
  type: EvidenceType;
  framework: string;
  control: string;
  period: string;
  completed_by: string;
  completed_at: string; // ISO 8601
  items?: SubmittedChecklistItem[];
  declaration_text?: string;
  accepted?: boolean;
  attachments?: string[];
}
