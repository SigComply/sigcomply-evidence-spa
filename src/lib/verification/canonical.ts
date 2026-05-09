// canonicalJSON serialises a value identically to the Go CLI's
// internal/core/attestation/canonical.go: object keys sorted alphabetically
// at every nesting level, no whitespace, and Go's default HTML-safe escapes
// for <, >, & (<, >, &).
//
// The CLI signs the canonical JSON of EvidenceEnvelope.signed. To verify a
// signature in the browser, we must reproduce the exact same byte sequence.

function escapeHtmlSafe(s: string): string {
  return s.replace(/[<>&]/g, (c) => {
    switch (c) {
      case "<":
        return "\\u003c";
      case ">":
        return "\\u003e";
      case "&":
        return "\\u0026";
      default:
        return c;
    }
  });
}

function canonicalize(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return escapeHtmlSafe(JSON.stringify(v));
  if (typeof v === "number" || typeof v === "boolean") return JSON.stringify(v);
  if (Array.isArray(v)) {
    return "[" + v.map(canonicalize).join(",") + "]";
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => {
      const keyJson = escapeHtmlSafe(JSON.stringify(k));
      return keyJson + ":" + canonicalize(obj[k]);
    });
    return "{" + parts.join(",") + "}";
  }
  // bigint / function / symbol: not representable in JSON — coerce to null.
  return "null";
}

export function canonicalJSON(value: unknown): string {
  return canonicalize(value);
}
