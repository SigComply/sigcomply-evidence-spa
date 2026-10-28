/// <reference types="node" />
import { generateKeyPairSync, sign } from "node:crypto";
import { canonicalJSON } from "../lib/verification/canonical";

/**
 * Signs `records` the way the CLI does (Ed25519 over the canonical JSON of
 * format_version, produced_at and records) with a fresh key, and returns the
 * envelope text. For tests that need a valid envelope of a shape no fixture
 * has; never a stand-in for the CLI goldens.
 */
export function signEnvelope(records: unknown[], producedAt = "2026-05-15T12:00:00Z"): string {
  const content = { format_version: "envelope.v1", produced_at: producedAt, records };
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  const value = sign(null, Buffer.from(canonicalJSON(content), "utf-8"), privateKey);
  return JSON.stringify({
    ...content,
    signature: { algorithm: "ed25519", public_key: raw.toString("base64"), value: value.toString("base64") },
  });
}

/** The CLI's record for an empty folder (manualManifest with no files). */
export function emptyFolderRecord(evidenceId = "code_of_conduct_acknowledgment", periodId = "2026") {
  return {
    collected_at: "2026-05-15T12:00:01Z",
    id: `${evidenceId}/${periodId}`,
    payload: {
      evidence_id: evidenceId,
      expected_uri: `s3://acme-evidence/manual/${evidenceId}/${periodId}/`,
      file_present: false,
      file_valid: false,
      in_temporal_window: false,
      period_id: periodId,
    },
    source_id: "manual.pdf",
    type: "signed_document",
  };
}
