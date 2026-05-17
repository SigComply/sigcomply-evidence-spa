// copyText copies a string to the clipboard, returning whether it succeeded.
// Used by the upload-path UI on the dashboard and the EvidenceForm success
// screen — making the manual download→reupload hop a single click instead of
// a hand-selection of a long key. No network, no dependency.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path (e.g. non-secure context / older Safari)
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
