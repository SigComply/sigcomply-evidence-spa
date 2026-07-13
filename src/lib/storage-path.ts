// EVIDENCE_PDF_FILENAME is the filename this SPA downloads and the name it
// suggests for the upload. The CLI's manual reader is filename-agnostic — it
// globs every file under the period folder — so any name works; this is just a
// sensible default. Cross-repo layout contract (keep in lockstep with the Go
// side `internal/sources/manual`): the CLI scans
//
//   {prefix}{evidence_id}/{period_id}/
//
// with the prefix carrying its own trailing slash (Go default "manual/") and
// NO framework segment (one project = one repo = one framework).
export const EVIDENCE_PDF_FILENAME = "evidence.pdf";

// normalizePrefix collapses trailing slashes to exactly one so the segment
// joins cleanly onto the evidence_id, mirroring the Go side which concatenates
// a trailing-slash prefix directly (`{prefix}{evidence_id}/...`). An empty
// prefix yields "" (evidence_id becomes the first segment).
function normalizePrefix(prefix: string): string {
  const trimmed = prefix.replace(/\/+$/, "");
  return trimmed === "" ? "" : `${trimmed}/`;
}

// computeUploadPath builds the path (inside the evidence bucket) where the
// customer drops this period's manual evidence. Matches the CLI folder layout
// exactly: {prefix}{evidence_id}/{period_id}/ — no framework segment. The
// filename is only a suggested download name; the CLI reads the whole folder.
export function computeUploadPath(
  prefix: string,
  evidenceId: string,
  period: string
): string {
  return `${normalizePrefix(prefix)}${evidenceId}/${period}/${EVIDENCE_PDF_FILENAME}`;
}
