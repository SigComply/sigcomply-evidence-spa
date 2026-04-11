export type EvidenceType = "document_upload" | "checklist" | "declaration";

export type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export type TemporalRule = "retrospective" | "anytime";

export interface ChecklistItem {
  id: string;
  text: string;
  required: boolean;
}

export interface CatalogEntry {
  id: string;
  control: string;
  type: EvidenceType;
  frequency: Frequency;
  temporal_rule: TemporalRule;
  grace_period: string;
  name: string;
  description: string;
  severity: string;
  accepted_formats?: string[];
  items?: ChecklistItem[];
  declaration_text?: string;
  category?: string;
  tsc?: string;
  optional?: boolean;
}

export interface Catalog {
  framework: string;
  version: string;
  entries: CatalogEntry[];
}
