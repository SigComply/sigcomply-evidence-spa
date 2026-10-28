import type { PdfInput } from "@/types/pdf-input";

// keywordValue percent-encodes the characters that would let a value forge a
// key or end its pair (`;`, `=`), and `%` itself so decoding is unambiguous.
// Ordinary values pass through unchanged.
export function keywordValue(value: string): string {
  return value.replace(/[%;=]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

// metadataKeywords is the deterministic anchor a future text-extractor in the
// CLI can parse out of the PDF Info dictionary. Keep the order, separators,
// and key names stable across all documents — this is a cross-repo contract.
// Split on "; ", then on the first "=", then percent-decode the value.
export function metadataKeywords(input: PdfInput): string {
  const parts = [
    `evidence_id=${keywordValue(input.evidence_id)}`,
    `framework=${keywordValue(input.framework)}`,
    `control=${keywordValue(input.control)}`,
    `period=${keywordValue(input.period)}`,
    `type=${keywordValue(input.type)}`,
    `completed_by=${keywordValue(input.completed_by)}`,
    `completed_at=${keywordValue(input.completed_at)}`,
  ];
  if (typeof input.accepted === "boolean") {
    parts.push(`accepted=${input.accepted}`);
  }
  return parts.join("; ");
}
