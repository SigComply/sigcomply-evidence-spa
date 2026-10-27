import { afterEach, describe, expect, it, vi } from "vitest";
import {
  sha256Hex,
  verifyEnvelopeSignature,
  WebCryptoUnsupportedError,
} from "./verify";
import { isEvidenceEnvelope, type EvidenceEnvelope } from "@/types/envelope";
import sampleEnvelope from "./__fixtures__/sample-envelope-v1.json";
import manualEnvelope from "./__fixtures__/sample-envelope-v1-manual.json";
// Raw text (not a JSON module): the 64-bit payload integers must reach the
// verifier un-rounded, so the lexeme-preserving path can be exercised.
import bignumEnvelopeRaw from "./__fixtures__/sample-envelope-v1-bignum.json?raw";

function loadFixture(raw: unknown): EvidenceEnvelope {
  if (!isEvidenceEnvelope(raw)) {
    throw new Error("fixture does not match EvidenceEnvelope shape");
  }
  return raw;
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

describe("verifyEnvelopeSignature", () => {
  it("returns valid for a CLI-written envelope.v1 fixture", async () => {
    const env = loadFixture(sampleEnvelope);
    const result = await verifyEnvelopeSignature(env);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
    // signedBytes must be the three-field canonical encoding — never
    // include the signature block.
    expect(result.signedBytes).not.toContain("signature");
  });

  it("returns valid for a manual-flow signed_document envelope", async () => {
    const env = loadFixture(manualEnvelope);
    const result = await verifyEnvelopeSignature(env);
    expect(result.valid).toBe(true);
  });

  it("returns invalid when a record payload field is tampered with", async () => {
    const env = loadFixture(deepClone(sampleEnvelope));
    // Flip a single field inside the first record's payload.
    (env.records[0].payload as Record<string, unknown>).mfa_enabled = true;
    const result = await verifyEnvelopeSignature(env);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/does not match/i);
  });

  it("returns invalid when the records array is tampered with", async () => {
    const env = loadFixture(deepClone(sampleEnvelope));
    env.records.push({
      type: "user_record",
      id: "INJECTED",
      payload: { id: "INJECTED" },
      source_id: "aws.iam",
      collected_at: "2026-05-23T14:00:02Z",
    });
    const result = await verifyEnvelopeSignature(env);
    expect(result.valid).toBe(false);
  });

  it("returns invalid when format_version is tampered with", async () => {
    const env = loadFixture(deepClone(sampleEnvelope));
    env.format_version = "envelope.v2";
    const result = await verifyEnvelopeSignature(env);
    expect(result.valid).toBe(false);
  });

  it("returns invalid when produced_at is tampered with", async () => {
    const env = loadFixture(deepClone(sampleEnvelope));
    env.produced_at = "2099-01-01T00:00:00Z";
    const result = await verifyEnvelopeSignature(env);
    expect(result.valid).toBe(false);
  });

  it("returns invalid when the signature value is flipped", async () => {
    const env = loadFixture(deepClone(sampleEnvelope));
    // Flip the first base64 character — produces a valid-length signature
    // that won't verify.
    const sig = env.signature.value;
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    env.signature.value = flipped;
    const result = await verifyEnvelopeSignature(env);
    expect(result.valid).toBe(false);
  });

  it("rejects unsupported signature algorithms", async () => {
    const env = loadFixture(deepClone(sampleEnvelope));
    env.signature.algorithm = "rsa-pss";
    const result = await verifyEnvelopeSignature(env);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Unsupported signature algorithm/);
  });

  describe("64-bit payload integers", () => {
    // The CLI signs payload integers verbatim (json.RawMessage + UseNumber),
    // so an envelope with a 2^63-scale value must verify — but only when
    // canonical bytes are derived from the raw text, not a rounded JSON.parse.
    const env = loadFixture(JSON.parse(bignumEnvelopeRaw));

    it("verifies when the raw text is supplied (lexeme-preserving path)", async () => {
      const result = await verifyEnvelopeSignature(env, bignumEnvelopeRaw);
      expect(result.valid).toBe(true);
      expect(result.signedBytes).toContain("9223372036854775807");
    });

    it("fails without the raw text (JSON.parse rounds the ints)", async () => {
      // Documents why Verify.tsx must pass the original text: the object path
      // canonicalises rounded integers and computes the wrong bytes.
      const result = await verifyEnvelopeSignature(env);
      expect(result.valid).toBe(false);
    });
  });

  describe("malformed signature block", () => {
    // 32 and 64 zero bytes, base64.
    const KEY_31 = btoa("\0".repeat(31));
    const SIG_63 = btoa("\0".repeat(63));

    it.each([
      ["public_key", "not base64!", /public_key is not valid base64/],
      ["public_key", KEY_31, /public key must be 32 bytes; got 31/],
      ["value", "%%%", /signature\.value is not valid base64/],
      ["value", SIG_63, /signature must be 64 bytes; got 63/],
    ] as const)("rejects a bad %s (%s)", async (field, value, reason) => {
      const env = loadFixture(deepClone(sampleEnvelope));
      env.signature[field] = value;
      const result = await verifyEnvelopeSignature(env);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(reason);
      // The canonical bytes are still reported so the UI can show them.
      expect(result.signedBytes).toContain('"format_version":"envelope.v1"');
    });
  });

  describe("browser without Ed25519", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it("throws WebCryptoUnsupportedError when crypto.subtle is missing", async () => {
      vi.stubGlobal("crypto", {});
      const env = loadFixture(deepClone(sampleEnvelope));
      await expect(verifyEnvelopeSignature(env)).rejects.toBeInstanceOf(
        WebCryptoUnsupportedError,
      );
    });

    it("throws WebCryptoUnsupportedError when importKey rejects Ed25519", async () => {
      vi.spyOn(crypto.subtle, "importKey").mockRejectedValue(
        new DOMException("Unrecognized name.", "NotSupportedError"),
      );
      const env = loadFixture(deepClone(sampleEnvelope));
      const err = await verifyEnvelopeSignature(env).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(WebCryptoUnsupportedError);
      expect((err as Error).message).toMatch(/does not support Ed25519/);
      expect((err as Error).message).toMatch(/Unrecognized name/);
    });
  });
});

describe("sha256Hex", () => {
  it("returns lowercase hex of the SHA-256 digest", async () => {
    const bytes = new TextEncoder().encode("abc");
    const buf = bytes.buffer.slice(0, bytes.byteLength) as ArrayBuffer;
    expect(await sha256Hex(buf)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
