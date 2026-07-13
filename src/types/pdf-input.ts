// PdfInput is the shape produced by useEvidenceForm and consumed by the PDF
// renderer in src/lib/pdf/. It bundles every value the rendered evidence.pdf
// header, body, and PDF metadata fields need.
//
// The CLI does not parse the PDF in v1 — the storage-side contract is the
// folder layout {prefix}{evidence_id}/{period}/ (no framework segment; the
// CLI globs the folder and is filename-agnostic), plus a stable `keywords`
// string in the PDF Info dictionary that future text-extraction policies can
// parse. See src/lib/pdf/shared.tsx for the metadata layout.

import type { EvidenceType, Frequency } from "@/types/catalog";

export interface ChecklistItemInput {
  id: string;
  text: string;
  required: boolean;
  checked: boolean;
  notes?: string;
}

export interface PdfInput {
  // Identity (also encoded in the PDF Info dictionary).
  evidence_id: string;
  framework: string;
  control: string;
  period: string;

  // Render mode + display metadata.
  type: Extract<EvidenceType, "declaration" | "checklist">;
  entry_name: string;
  entry_description: string;
  severity: string;
  frequency: Frequency;

  // Audit trail (visible header + PDF Info dict keywords).
  completed_by: string;
  completed_at: string; // ISO 8601

  // Type-specific fields (one of these is populated per `type`).
  declaration_text?: string;
  accepted?: boolean;
  items?: ChecklistItemInput[];
}
