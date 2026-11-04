import {
  ENVELOPE_FORMAT_VERSION,
  isEvidenceEnvelope,
  manualPayloadProblem,
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

const PDF_MESSAGE =
  "This is a PDF. Load the evidence envelope (.json) first, then check the PDF below it.";
const MANIFEST_MESSAGE =
  "This is the run's manifest.json. This page checks one evidence envelope from the run's policies folder, and it doesn't verify the manifest.";

// A PDF may carry a few bytes before its "%PDF-" header; readers look in the
// first 1024.
function looksLikePdf(text: string, name?: string): boolean {
  return (
    text.slice(0, 1024).includes("%PDF-") ||
    (name?.toLowerCase().endsWith(".pdf") ?? false)
  );
}

// The signed run manifest (schema_version "run.v1", a `file_hashes` map), as
// scripts/verify-envelopes.ts verifyManifest reads it.
function looksLikeManifest(v: unknown): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return (
    o.schema_version === "run.v1" ||
    (!!o.file_hashes && typeof o.file_hashes === "object")
  );
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
 * `name` (the file's name, when there is one) only sharpens the message for a
 * file that isn't JSON.
 */
export function parseEnvelopeText(
  text: string,
  opts?: { name?: string },
): ParseEnvelopeResult {
  if (!text.trim()) return { kind: "empty" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    if (looksLikePdf(text, opts?.name)) {
      return { kind: "invalid", message: PDF_MESSAGE };
    }
    return { kind: "invalid", message: describeJsonError(err as Error, text) };
  }
  const pretty = prettyPrint(parsed, text);

  if (!isEvidenceEnvelope(parsed) && looksLikeManifest(parsed)) {
    return { kind: "invalid", message: MANIFEST_MESSAGE, pretty };
  }

  if (!isEvidenceEnvelope(parsed)) {
    return {
      kind: "invalid",
      message:
        "This doesn't look like a SigComply signed-evidence file, which the CLI writes to a run's policies/<policy_id>/envelopes/ folder. Expected fields: format_version, produced_at, records[] (with type, id, source_id, collected_at, payload), signature.algorithm, signature.public_key, signature.value.",
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

  for (const r of parsed.records) {
    if (r.type !== "signed_document") continue;
    const problem = manualPayloadProblem(r.payload);
    if (problem) {
      return {
        kind: "invalid",
        message: `This file has a manual evidence record the CLI couldn't have written. ${problem}`,
        pretty,
      };
    }
  }

  return { kind: "ok", envelope: parsed, sourceText: text, pretty };
}
