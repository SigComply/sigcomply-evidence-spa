import { describe, expect, it } from "vitest";
import { verifyEnvelopeSignature } from "./verify";
import { isEvidenceEnvelope, type EvidenceEnvelope } from "@/types/envelope";
import sampleEnvelope from "./__fixtures__/sample-envelope-v1.json";
import manualEnvelope from "./__fixtures__/sample-envelope-v1-manual.json";

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
});
