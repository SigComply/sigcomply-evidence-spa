// EVIDENCE_PDF_FILENAME is the strict, fixed filename the SigComply CLI looks
// for under {framework}/{evidence_id}/{period}/. Cross-repo contract — keep
// in lockstep with the Go-side `manual.EvidencePDFFilename`.
export const EVIDENCE_PDF_FILENAME = "evidence.pdf";

export function computeUploadPath(
  prefix: string,
  framework: string,
  evidenceId: string,
  period: string
): string {
  return `${prefix}/${framework}/${evidenceId}/${period}/${EVIDENCE_PDF_FILENAME}`;
}
