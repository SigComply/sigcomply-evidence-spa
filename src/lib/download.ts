// downloadBlob triggers a browser download of an in-memory Blob. The PDF
// renderer in src/lib/pdf produces Blobs of type application/pdf; this helper
// is generic so future flows (CSV, archive, etc.) can reuse it.
const REVOKE_AFTER_MS = 30_000;

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoking at once can cancel a download the browser hasn't started
  // reading yet, so the URL stays valid for a while.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
