import type { EvidenceEnvelope } from "@/types/envelope";
import { canonicalJSON, parseJSONPreservingNumbers } from "./canonical";

/**
 * Thrown when the running browser does not implement the Web Crypto
 * Ed25519 primitive — either `crypto.subtle` is missing entirely or
 * `importKey` rejects the `Ed25519` algorithm. Surfaced separately so
 * the UI can render an "upgrade your browser" notice instead of a
 * generic failure.
 */
export class WebCryptoUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebCryptoUnsupportedError";
  }
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  /** The canonical UTF-8 string the signature was checked against. */
  signedBytes: string;
}

/** Pulls the three signed content fields out of a parsed envelope value. */
function signedContent(source: {
  format_version: unknown;
  produced_at: unknown;
  records: unknown;
}) {
  return {
    format_version: source.format_version,
    produced_at: source.produced_at,
    records: source.records,
  };
}

/**
 * Verifies the Ed25519 signature embedded in an envelope.v1 file.
 *
 * The signed payload is `canonicalJSON({format_version, produced_at,
 * records})` — three fields, in that order. The `signature` block is
 * stripped before canonicalisation; a verifier reconstructs the three
 * content fields and re-runs the canonical encoder.
 *
 * Pass `rawText` (the original, un-reformatted envelope JSON) to derive the
 * canonical bytes from a lexeme-preserving parse. This is required for
 * envelopes whose record payloads carry integers above 2^53 (64-bit IDs,
 * epoch-nanosecond timestamps): `JSON.parse` rounds those, but the CLI signs
 * them verbatim, so canonicalising the rounded object would compute the wrong
 * bytes and reject a valid signature. Without `rawText`, canonicalisation
 * falls back to the parsed object (correct for all float64-safe numbers).
 */
export async function verifyEnvelopeSignature(
  envelope: EvidenceEnvelope,
  rawText?: string,
): Promise<VerifyResult> {
  const canonicalSource =
    rawText != null
      ? signedContent(
          parseJSONPreservingNumbers(rawText) as {
            format_version: unknown;
            produced_at: unknown;
            records: unknown;
          },
        )
      : signedContent(envelope);
  const signedBytes = canonicalJSON(canonicalSource);

  if (envelope.signature.algorithm !== "ed25519") {
    return {
      valid: false,
      reason: `Unsupported signature algorithm: ${envelope.signature.algorithm}. Expected "ed25519".`,
      signedBytes,
    };
  }

  if (!globalThis.crypto?.subtle) {
    throw new WebCryptoUnsupportedError(
      "Web Crypto API is not available in this browser.",
    );
  }

  let publicKey: Uint8Array<ArrayBuffer>;
  let signature: Uint8Array<ArrayBuffer>;
  try {
    publicKey = base64ToBytes(envelope.signature.public_key);
  } catch {
    return {
      valid: false,
      reason: "signature.public_key is not valid base64.",
      signedBytes,
    };
  }
  if (publicKey.length !== 32) {
    return {
      valid: false,
      reason: `Ed25519 public key must be 32 bytes; got ${publicKey.length}.`,
      signedBytes,
    };
  }
  try {
    signature = base64ToBytes(envelope.signature.value);
  } catch {
    return {
      valid: false,
      reason: "signature.value is not valid base64.",
      signedBytes,
    };
  }
  if (signature.length !== 64) {
    return {
      valid: false,
      reason: `Ed25519 signature must be 64 bytes; got ${signature.length}.`,
      signedBytes,
    };
  }

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "raw",
      publicKey,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
  } catch (err) {
    throw new WebCryptoUnsupportedError(
      "This browser does not support Ed25519 in Web Crypto. " +
        "Use Chrome 113+, Safari 17+, or Firefox 130+. " +
        `(${(err as Error).message})`,
    );
  }

  const utf8 = new TextEncoder().encode(signedBytes);
  const encoded = new Uint8Array(new ArrayBuffer(utf8.byteLength));
  encoded.set(utf8);
  const valid = await crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    signature,
    encoded,
  );

  return {
    valid,
    reason: valid
      ? undefined
      : "Signature does not match the canonical signed payload.",
    signedBytes,
  };
}

/** Hex-encoded SHA-256 of the given bytes. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}
