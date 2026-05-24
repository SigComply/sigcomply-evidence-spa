// EvidenceEnvelope is the on-disk envelope.v1 format the CLI writes for every
// signed evidence file in the customer's vault. Each file is independently
// verifiable — the signature block (algorithm, public key, signature value)
// travels alongside the three signed content fields (format_version,
// produced_at, records).
//
// Mirrors internal/core/envelope.go in sigcomply-cli (M5/M6). The signature
// covers canonical JSON of {format_version, produced_at, records} — three
// fields, no signature sentinel.

export const ENVELOPE_FORMAT_VERSION = "envelope.v1";

export interface EvidenceRecord {
  type: string;
  id: string;
  /** Optional cross-source identity (e.g. email for user_record). */
  identity_key?: string;
  /** Source-specific record payload; opaque to the verifier. */
  payload: Record<string, unknown>;
  source_id: string;
  /** RFC 3339 / ISO 8601 string. */
  collected_at: string;
}

export interface EnvelopeSignature {
  /** Currently always "ed25519". */
  algorithm: string;
  /** Base64-encoded 32-byte Ed25519 public key. */
  public_key: string;
  /** Base64-encoded 64-byte Ed25519 signature. */
  value: string;
}

export interface EvidenceEnvelope {
  /** Always "envelope.v1" for the current CLI. */
  format_version: string;
  /** RFC 3339 / ISO 8601 timestamp the envelope was produced at. */
  produced_at: string;
  records: EvidenceRecord[];
  signature: EnvelopeSignature;
}

/** Minimal type guard for parsed JSON → EvidenceEnvelope. */
export function isEvidenceEnvelope(v: unknown): v is EvidenceEnvelope {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  if (typeof e.format_version !== "string") return false;
  if (typeof e.produced_at !== "string") return false;
  if (!Array.isArray(e.records)) return false;
  for (const r of e.records) {
    if (!r || typeof r !== "object") return false;
    const rec = r as Record<string, unknown>;
    if (typeof rec.type !== "string") return false;
    if (typeof rec.id !== "string") return false;
    if (typeof rec.source_id !== "string") return false;
    if (typeof rec.collected_at !== "string") return false;
    if (
      rec.identity_key !== undefined &&
      typeof rec.identity_key !== "string"
    ) {
      return false;
    }
    if (
      !rec.payload ||
      typeof rec.payload !== "object" ||
      Array.isArray(rec.payload)
    ) {
      return false;
    }
  }
  if (!e.signature || typeof e.signature !== "object") return false;
  const sig = e.signature as Record<string, unknown>;
  if (typeof sig.algorithm !== "string") return false;
  if (typeof sig.public_key !== "string") return false;
  if (typeof sig.value !== "string") return false;
  return true;
}

/**
 * Shape of the payload the `manual.pdf` source plugin emits inside a
 * `signed_document` record. Surfaced separately so the verifier UI can
 * cross-check a sibling PDF's SHA-256 against `file_hash`.
 */
export interface ManualDocumentPayload {
  evidence_id?: string;
  file_hash?: string;
  file_path?: string;
  period?: string;
  framework?: string;
}

/**
 * Returns the manual-flow payload (if any) carried by a `signed_document`
 * record in the envelope. Manual-flow envelopes carry exactly one such
 * record per source/period; if more than one is found, the first is
 * returned. Returns null when no manual record is present.
 */
export function getManualDocumentPayload(
  env: EvidenceEnvelope,
): ManualDocumentPayload | null {
  for (const r of env.records) {
    if (r.type !== "signed_document") continue;
    const payload = r.payload as ManualDocumentPayload;
    if (typeof payload.file_hash === "string") {
      return payload;
    }
  }
  return null;
}
