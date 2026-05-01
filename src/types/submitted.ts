export interface SubmittedEvidence {
  schema_version: string;
  evidence_id: string;
  type: "declaration";
  framework: string;
  control: string;
  period: string;
  completed_by: string;
  completed_at: string; // ISO 8601
  declaration_text?: string;
  accepted: boolean;
}
