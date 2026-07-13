// canonicalJSON serialises a value byte-identically to the Go CLI's
// internal/sign/canonical.go (`Encode`). The Ed25519 envelope signing
// scheme depends on both sides producing the same bytes for the same
// logical input.
//
// Rules implemented (RFC 8785-style, matching Go's encoding/json with
// SetEscapeHTML(false)):
//   1. UTF-8 (handled by TextEncoder at the call site).
//   2. No insignificant whitespace.
//   3. Object keys sorted lexicographically by UTF-16 code unit (which
//      equals Unicode code-point order for the BMP and matches Go's
//      `sort.Strings` on UTF-8 strings).
//   4. Strings escape per RFC 8259: `\"`, `\\`, `\b`, `\f`, `\n`, `\r`,
//      `\t` as named mnemonics; other control characters (U+0000 to
//      U+001F) and the JS line separators U+2028 / U+2029 as `\uXXXX`.
//      Everything else - including `<`, `>`, `&` - emitted verbatim.
//   5. Numbers use the shortest round-trippable decimal form. JS
//      `JSON.stringify` produces the same output as Go's
//      `encoding/json` for finite numbers, which is what the CLI emits
//      (it has no floats in signed payloads beyond JSON-roundtrippable
//      integers).
//   6. Array order preserved.

function encodeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    switch (code) {
      case 0x22: // "
        out += '\\"';
        continue;
      case 0x5c: // backslash
        out += "\\\\";
        continue;
      case 0x08:
        out += "\\b";
        continue;
      case 0x09:
        out += "\\t";
        continue;
      case 0x0a:
        out += "\\n";
        continue;
      case 0x0c:
        out += "\\f";
        continue;
      case 0x0d:
        out += "\\r";
        continue;
      default:
        break;
    }
    if (code < 0x20) {
      out += "\\u" + code.toString(16).padStart(4, "0");
      continue;
    }
    if (code === 0x2028 || code === 0x2029) {
      // Go's encoding/json escapes these unconditionally for JS safety.
      out += "\\u" + code.toString(16).padStart(4, "0");
      continue;
    }
    out += s[i];
  }
  out += '"';
  return out;
}

function encodeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    // Go's encoding/json refuses to marshal NaN/+/-Inf; mirror that by
    // throwing so callers see the same hard failure rather than a
    // silent canonicalisation divergence.
    throw new Error(`canonical: non-finite number ${n}`);
  }
  // JSON.stringify on a finite number produces the shortest
  // round-trippable decimal, matching Go's strconv.AppendFloat with
  // 'g'/-1, which is what encoding/json uses.
  return JSON.stringify(n);
}

function encodeValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  // A number whose exact source lexeme was preserved at parse time (see
  // parseJSONPreservingNumbers). Emit it verbatim to mirror the CLI, which
  // canonicalises numbers as `json.Number` source text — so integers beyond
  // float64's 2^53 range survive byte-for-byte instead of being rounded.
  if (v instanceof LosslessNumber) return v.source;
  if (typeof v === "number") return encodeNumber(v);
  if (typeof v === "string") return encodeString(v);
  if (Array.isArray(v)) {
    let out = "[";
    for (let i = 0; i < v.length; i++) {
      if (i > 0) out += ",";
      out += encodeValue(v[i]);
    }
    return out + "]";
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    // Drop keys whose value is `undefined` to match JSON semantics:
    // `JSON.stringify` omits them, and Go can't produce them at all.
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    let out = "{";
    for (let i = 0; i < keys.length; i++) {
      if (i > 0) out += ",";
      out += encodeString(keys[i]);
      out += ":";
      out += encodeValue(obj[keys[i]]);
    }
    return out + "}";
  }
  // bigint / function / symbol: not representable. Throw so signers and
  // verifiers fail loudly rather than silently producing divergent bytes.
  throw new Error(`canonical: unsupported value type ${typeof v}`);
}

export function canonicalJSON(value: unknown): string {
  return encodeValue(value);
}

/**
 * A JSON number whose exact source text is preserved. `JSON.parse` coerces
 * every number to an IEEE-754 float64, silently rounding integers above 2^53
 * (e.g. a 64-bit resource ID or epoch-nanosecond timestamp). The CLI signs
 * such numbers verbatim — it holds record payloads as `json.RawMessage` and
 * canonicalises with `json.Decoder.UseNumber()`, so the source digits survive
 * into the signed bytes. To reproduce those bytes, the verifier must keep the
 * digits too; canonicalJSON emits `source` verbatim for these.
 */
export class LosslessNumber {
  readonly source: string;
  constructor(source: string) {
    this.source = source;
  }
}

// Reviver signature including the ES2023 "source text access" third argument
// (`context.source`), which older lib typings omit.
type SourceReviver = (
  key: string,
  value: unknown,
  context?: { source?: string },
) => unknown;

/**
 * Like `JSON.parse`, but wraps every number in a {@link LosslessNumber}
 * carrying its exact source lexeme, so canonicalJSON can re-emit it byte-for-
 * byte. Relies on the reviver `context.source` argument (Node 21.1+, Chrome
 * 122+, Firefox 125+, Safari 17.5+). On engines without it, `context` is
 * undefined and numbers fall through as ordinary float64 — identical to the
 * previous behaviour, so nothing breaks (large-integer envelopes simply remain
 * unverifiable there, as they were before). This is used only to derive the
 * signed bytes; the parsed envelope shown in the UI still uses plain
 * `JSON.parse`.
 */
export function parseJSONPreservingNumbers(text: string): unknown {
  const reviver: SourceReviver = (_key, value, context) => {
    if (typeof value === "number" && typeof context?.source === "string") {
      return new LosslessNumber(context.source);
    }
    return value;
  };
  return JSON.parse(text, reviver as (key: string, value: unknown) => unknown);
}
