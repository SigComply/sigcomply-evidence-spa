// Best-effort reads and writes of small `sigcomply:*` preferences. Storage
// can throw (Safari private mode, blocked site data, a full quota) or be
// missing; a preference is a convenience, so failures fall back to "unset"
// rather than breaking the page. Same policy as device-memory.ts.

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
