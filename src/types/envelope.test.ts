import { describe, expect, it } from "vitest";
import { getManualDocumentPayload, isEvidenceEnvelope } from "./envelope";
import sample from "@/lib/verification/__fixtures__/sample-envelope-v1.json";
import manual from "@/lib/verification/__fixtures__/sample-envelope-v1-manual.json";

type Mutable = Record<string, unknown> & {
  records?: Record<string, unknown>[];
  signature?: Record<string, unknown>;
};

function clone(): Mutable {
  return JSON.parse(JSON.stringify(sample)) as Mutable;
}

describe("isEvidenceEnvelope", () => {
  it("accepts the CLI fixtures", () => {
    expect(isEvidenceEnvelope(sample)).toBe(true);
    expect(isEvidenceEnvelope(manual)).toBe(true);
  });

  it.each([null, undefined, 42, "envelope", []])(
    "rejects a non-object (%s)",
    (v) => {
      expect(isEvidenceEnvelope(v)).toBe(false);
    },
  );

  it.each<[string, (e: Mutable) => void]>([
    ["format_version not a string", (e) => (e.format_version = 1)],
    ["produced_at missing", (e) => delete e.produced_at],
    ["records not an array", (e) => (e.records = {} as never)],
    ["a record is null", (e) => (e.records![0] = null as never)],
    ["record.type missing", (e) => delete e.records![0].type],
    ["record.id not a string", (e) => (e.records![0].id = 7)],
    ["record.source_id missing", (e) => delete e.records![0].source_id],
    ["record.collected_at missing", (e) => delete e.records![0].collected_at],
    ["record.identity_key not a string", (e) => (e.records![0].identity_key = 1)],
    ["record.payload missing", (e) => delete e.records![0].payload],
    ["record.payload an array", (e) => (e.records![0].payload = [])],
    ["record.payload a string", (e) => (e.records![0].payload = "x")],
    ["signature missing", (e) => delete e.signature],
    ["signature not an object", (e) => (e.signature = "sig" as never)],
    ["signature.algorithm missing", (e) => delete e.signature!.algorithm],
    ["signature.public_key not a string", (e) => (e.signature!.public_key = 1)],
    ["signature.value missing", (e) => delete e.signature!.value],
  ])("rejects an envelope with %s", (_name, mutate) => {
    const e = clone();
    mutate(e);
    expect(isEvidenceEnvelope(e)).toBe(false);
  });

  it("accepts a string identity_key and an empty records array", () => {
    const e = clone();
    e.records![0].identity_key = "alice@example.com";
    expect(isEvidenceEnvelope(e)).toBe(true);
    e.records = [];
    expect(isEvidenceEnvelope(e)).toBe(true);
  });
});

describe("getManualDocumentPayload", () => {
  it("returns the signed_document payload of a manual envelope", () => {
    if (!isEvidenceEnvelope(manual)) throw new Error("bad fixture");
    expect(getManualDocumentPayload(manual)?.evidence_id).toBe(
      "access_review_quarterly",
    );
  });

  it("returns null for an automated envelope", () => {
    if (!isEvidenceEnvelope(sample)) throw new Error("bad fixture");
    expect(getManualDocumentPayload(sample)).toBeNull();
  });
});
