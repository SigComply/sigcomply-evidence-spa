import {
  ENVELOPE_FORMAT_VERSION,
  isEvidenceEnvelope,
  type EvidenceEnvelope,
} from "@/types/envelope";

export type ParseEnvelopeResult =
  | { kind: "empty" }
  | {
      kind: "invalid";
      message: string;
      /** Pretty-printed copy when the text was valid JSON of the wrong shape. */
      pretty?: string;
    }
  | {
      kind: "ok";
      envelope: EvidenceEnvelope;
      /**
       * The original text, untouched. The signature check canonicalises from
       * a lexeme-preserving parse of it, so integers above 2^53 survive.
       */
      sourceText: string;
      pretty: string;
    };

// JSON.parse messages vary by engine; V8 includes "position N". Turn that
// offset into a line/column so a malformed paste points somewhere.
export function describeJsonError(err: Error, src: string): string {
  const m = /position (\d+)/.exec(err.message);
  if (!m) return `Invalid JSON: ${err.message}`;
  const pos = Math.min(Number(m[1]), src.length);
  const before = src.slice(0, pos);
  const line = before.split("\n").length;
  const col = pos - before.lastIndexOf("\n");
  return `Invalid JSON at line ${line}, column ${col}: ${err.message}`;
}

function prettyPrint(parsed: unknown, fallback: string): string {
  try {
    return JSON.stringify(parsed, null, 2);
  } catch {
    return fallback;
  }
}

/**
 * Parses the text of a signed-evidence file and checks it is an envelope this
 * verifier handles. Shared by the `/verify` page and
 * `scripts/verify-envelopes.ts` so both accept and refuse the same files.
 */
export function parseEnvelopeText(text: string): ParseEnvelopeResult {
  if (!text.trim()) return { kind: "empty" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { kind: "invalid", message: describeJsonError(err as Error, text) };
  }
  const pretty = prettyPrint(parsed, text);

  if (!isEvidenceEnvelope(parsed)) {
    return {
      kind: "invalid",
      message:
        "This doesn't look like a SigComply signed-evidence file. Expected fields: format_version, produced_at, records[] (with type, id, source_id, collected_at, payload), signature.algorithm, signature.public_key, signature.value.",
      pretty,
    };
  }

  if (parsed.format_version !== ENVELOPE_FORMAT_VERSION) {
    return {
      kind: "invalid",
      message: `Unsupported envelope format_version "${parsed.format_version}". This verifier handles "${ENVELOPE_FORMAT_VERSION}".`,
      pretty,
    };
  }

  return { kind: "ok", envelope: parsed, sourceText: text, pretty };
}
