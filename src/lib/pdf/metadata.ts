import type { PdfInput } from "@/types/pdf-input";

// metadataKeywords is the deterministic anchor a future text-extractor in the
// CLI can parse out of the PDF Info dictionary. Keep the order, separators,
// and key names stable across all documents — this is a cross-repo contract.
export function metadataKeywords(input: PdfInput): string {
  const parts = [
    `evidence_id=${input.evidence_id}`,
    `framework=${input.framework}`,
    `control=${input.control}`,
    `period=${input.period}`,
    `type=${input.type}`,
    `completed_by=${input.completed_by}`,
    `completed_at=${input.completed_at}`,
  ];
  if (typeof input.accepted === "boolean") {
    parts.push(`accepted=${input.accepted}`);
  }
  return parts.join("; ");
}
