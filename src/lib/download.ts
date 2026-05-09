// downloadBlob triggers a browser download of an in-memory Blob. The PDF
// renderer in src/lib/pdf produces Blobs of type application/pdf; this helper
// is generic so future flows (CSV, archive, etc.) can reuse it.
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
