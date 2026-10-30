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
  /**
   * Optional account/region/project the observation was collected from.
   * Provenance only — the CLI's evaluator never branches on it and it never
   * crosses the aggregation boundary onto the wire. Most records omit it;
   * today only the GCP, Azure and `aws.identity_center` plugins stamp one.
   *
   * The verifier does not read it, but it is part of the signed content
   * (`records` is canonicalized whole), so it is declared here to keep this
   * mirror complete against `internal/core/evidence.go`.
   */
  scope?: RecordScope;
}

/** Cloud-neutral: `account` is an AWS account, GCP org/customer, Azure
 * subscription or Entra tenant; `project` a finer subdivision. */
export interface RecordScope {
  account?: string;
  region?: string;
  project?: string;
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
 * One entry in a manual manifest's per-file audit trail. Mirrors the Go
 * `sourceFile` struct in internal/sources/manual/manual.go — each original
 * upload (before image→PDF conversion / merge) with its own hash so auditors
 * can trace the merged evidence back to individual files.
 */
export interface ManualSourceFile {
  filename: string;
  /** "pdf", "jpeg", "png", … */
  type: string;
  /** SHA-256 of the original bytes, e.g. "sha256:<hex>". */
  sha256: string;
  /** RFC 3339 upload time, if the backend records one. */
  uploaded_at?: string;
  /** True when an image was converted to PDF. */
  converted?: boolean;
}

/**
 * Shape of the payload the `manual.pdf` source plugin emits inside a
 * `signed_document` record. Mirrors the Go `manualManifest` struct (JSON
 * tags) in internal/sources/manual/manual.go. Surfaced separately so the
 * verifier UI can cross-check a sibling PDF's SHA-256 against `file_hash`
 * and show the folder the CLI scanned (`expected_uri`). All fields are
 * optional so the verifier tolerates the CLI's `omitempty` output (e.g. an
 * empty-folder manifest carries no `file_hash`).
 */
export interface ManualDocumentPayload {
  evidence_id?: string;
  period_id?: string;
  file_present?: boolean;
  /** SHA-256 of the merged PDF, e.g. "sha256:<hex>". */
  file_hash?: string;
  /** Size of the merged PDF in bytes. */
  file_size?: number;
  /** Latest upload time across the source files (RFC 3339). */
  uploaded_at?: string;
  in_temporal_window?: boolean;
  file_valid?: boolean;
  validation_failures?: string[];
  /** Folder URI the CLI scanned, e.g. "s3://bucket/manual/<id>/<period>/". */
  expected_uri?: string;
  source_files?: ManualSourceFile[];
  /**
   * Present only on a fan-out entry (one folder per vendor). Then it is the
   * authoritative breakdown, there is no top-level `file_hash`, and the
   * scalar fields above are the conjunction over the required members.
   */
  instances?: ManualInstancePayload[];
  instances_total?: number;
  instances_satisfied?: number;
}

/**
 * One fan-out member's verdict inside a manual record. Mirrors the Go
 * `instanceManifest` struct in internal/sources/manual/manual.go.
 */
export interface ManualInstancePayload {
  /** Folder slug: the member's folder is `{evidence_id}.{id}`. */
  id: string;
  name?: string;
  tier?: string;
  /** False for an approved exemption: no upload is owed. */
  required: boolean;
  file_present: boolean;
  /** SHA-256 of this member's merged PDF, e.g. "sha256:<hex>". */
  file_hash?: string;
  file_size?: number;
  /** The CLI writes the zero time ("0001-01-01T00:00:00Z") when unset. */
  uploaded_at?: string;
  in_temporal_window: boolean;
  file_valid: boolean;
  validation_failures?: string[];
  expected_uri?: string;
  source_files?: ManualSourceFile[];
  /** The CLI's single verdict for this member. */
  satisfied: boolean;
  exemption_reason?: string;
  approved_by?: string;
  /** Declared YYYY-MM-DD end of the vendor's own assurance report. */
  assurance_period_end?: string;
}

type FieldKind = "string" | "boolean" | "number" | "strings" | "sourceFiles";

const SOURCE_FILE_FIELDS: Record<string, FieldKind> = {
  filename: "string",
  type: "string",
  sha256: "string",
  uploaded_at: "string",
  converted: "boolean",
};

const INSTANCE_FIELDS: Record<string, FieldKind> = {
  id: "string",
  name: "string",
  tier: "string",
  required: "boolean",
  file_present: "boolean",
  file_hash: "string",
  file_size: "number",
  uploaded_at: "string",
  in_temporal_window: "boolean",
  file_valid: "boolean",
  validation_failures: "strings",
  expected_uri: "string",
  source_files: "sourceFiles",
  satisfied: "boolean",
  exemption_reason: "string",
  approved_by: "string",
  assurance_period_end: "string",
};

const DOCUMENT_FIELDS: Record<string, FieldKind> = {
  evidence_id: "string",
  period_id: "string",
  file_present: "boolean",
  file_hash: "string",
  file_size: "number",
  uploaded_at: "string",
  in_temporal_window: "boolean",
  file_valid: "boolean",
  validation_failures: "strings",
  expected_uri: "string",
  source_files: "sourceFiles",
  instances_total: "number",
  instances_satisfied: "number",
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fieldProblem(
  obj: Record<string, unknown>,
  fields: Record<string, FieldKind>,
  where: string,
): string | null {
  for (const [key, kind] of Object.entries(fields)) {
    const v = obj[key];
    if (v === undefined || v === null) continue;
    const ok =
      kind === "strings"
        ? Array.isArray(v) && v.every((x) => typeof x === "string")
        : kind === "sourceFiles"
          ? Array.isArray(v) &&
            v.every((f) => isObject(f) && !fieldProblem(f, SOURCE_FILE_FIELDS, ""))
          : typeof v === kind;
    if (!ok) {
      const want =
        kind === "strings" ? "a list of strings" : kind === "sourceFiles" ? "a list of files" : `a ${kind}`;
      return `${where}${key} should be ${want}.`;
    }
  }
  return null;
}

/**
 * Why a `signed_document` payload doesn't have the shape the CLI writes
 * (`manualManifest`), or null when it does. Unknown fields are allowed;
 * a known field of the wrong type is not, because the page would render it.
 */
// Booleans the CLI writes on every manual record and member from v0.21.0 on
// (no omitempty in manualManifest / instanceManifest). file_valid shipped in
// v0.21.0, so v0.19-v0.20 manual envelopes lack it and fail here; none are in
// use (pre-launch). A missing one must not read as false or, for `required`,
// as an exempt member.
const RECORD_BOOLEANS = ["file_present", "in_temporal_window", "file_valid"];
const INSTANCE_BOOLEANS = ["required", "satisfied", ...RECORD_BOOLEANS];

function missingBoolean(obj: Record<string, unknown>, keys: string[], where: string): string | null {
  for (const k of keys) {
    if (typeof obj[k] !== "boolean") {
      return `${where}${k} should be a boolean; the CLI writes it on every manual record from v0.21.0 on.`;
    }
  }
  return null;
}

export function manualPayloadProblem(payload: Record<string, unknown>): string | null {
  const top = fieldProblem(payload, DOCUMENT_FIELDS, "signed_document payload: ");
  if (top) return top;
  // Only a manual record carries evidence_id; older fixtures use the
  // signed_document type for other payloads.
  if (payload.evidence_id !== undefined) {
    const missing = missingBoolean(payload, RECORD_BOOLEANS, "signed_document payload: ");
    if (missing) return missing;
  }
  const instances = payload.instances;
  if (instances === undefined || instances === null) return null;
  if (!Array.isArray(instances)) return "signed_document payload: instances should be a list.";
  for (const [i, m] of instances.entries()) {
    if (!isObject(m)) return `signed_document payload: instances[${i}] should be an object.`;
    const problem = fieldProblem(m, INSTANCE_FIELDS, `signed_document payload: instances[${i}].`);
    if (problem) return problem;
    if (typeof m.id !== "string") return `signed_document payload: instances[${i}].id should be a string.`;
    const missing = missingBoolean(m, INSTANCE_BOOLEANS, `signed_document payload: instances[${i}].`);
    if (missing) return missing;
  }
  return null;
}

/**
 * Returns the manual-flow payload (if any) carried by a `signed_document`
 * record in the envelope. Manual-flow envelopes carry exactly one such
 * record per source/period; if more than one is found, the first is
 * returned. Returns null when no manual record is present.
 *
 * The presence of the record — not `file_hash` — is what marks the envelope
 * as manual-flow: an empty-folder period produces a `signed_document` record
 * with no `file_hash`, and it should still read as "manual" in the UI. The
 * sibling-PDF hash check separately gates on `file_hash` being present.
 */
export function getManualDocumentPayload(
  env: EvidenceEnvelope,
): ManualDocumentPayload | null {
  for (const r of env.records) {
    if (r.type !== "signed_document") continue;
    return r.payload as ManualDocumentPayload;
  }
  return null;
}
