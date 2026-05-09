// EvidenceEnvelope is the on-disk format the CLI writes for every evidence
// file in the customer's vault. Each file is independently verifiable —
// public_key + signature travel with the signed payload.
//
// Mirrors internal/core/attestation/types.go in sigcomply-cli.

export interface SignedPayload {
  timestamp: string;
  evidence: unknown;
}

export interface Signature {
  algorithm: string;
  value: string;
}

export interface EvidenceEnvelope {
  signed: SignedPayload;
  public_key: string;
  signature: Signature;
}

// Manifest shape the CLI writes inside `evidence` for manual-flow envelopes.
// When `file_hash` is present, the auditor must additionally re-hash the
// sibling PDF and compare.
export interface ManualManifest {
  evidence_id?: string;
  file_hash?: string;
  file_path?: string;
  period?: string;
  framework?: string;
  status?: string;
  temporal_status?: string;
  expected_path?: string;
  expected_uri?: string;
}

export function isEvidenceEnvelope(v: unknown): v is EvidenceEnvelope {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  if (!e.signed || typeof e.signed !== "object") return false;
  const s = e.signed as Record<string, unknown>;
  if (typeof s.timestamp !== "string") return false;
  if (!("evidence" in s)) return false;
  if (typeof e.public_key !== "string") return false;
  if (!e.signature || typeof e.signature !== "object") return false;
  const sig = e.signature as Record<string, unknown>;
  if (typeof sig.algorithm !== "string") return false;
  if (typeof sig.value !== "string") return false;
  return true;
}

export function getManualManifest(env: EvidenceEnvelope): ManualManifest | null {
  const ev = env.signed.evidence;
  if (!ev || typeof ev !== "object" || Array.isArray(ev)) return null;
  const m = ev as ManualManifest;
  if (typeof m.file_hash === "string") return m;
  return null;
}
