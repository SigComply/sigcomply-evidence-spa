// Best-effort reads and writes of small `sigcomply:*` preferences. Storage
// can throw (Safari private mode, blocked site data, a full quota) or be
// missing; a preference is a convenience, so failures fall back to "unset"
// rather than breaking the page. Same policy as device-memory.ts.

// The framework last shown. The list reads it on load; a form opened from a
// deep link writes it, so "Back to list" shows that framework.
export const FRAMEWORK_PREF_KEY = "sigcomply:framework";

export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered on this device; nothing else depends on it.
  }
}
