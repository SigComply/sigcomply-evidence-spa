import { describe, expect, it } from "vitest";
import { describeJsonError, parseEnvelopeText } from "./parse-envelope";
import { ENVELOPE_FORMAT_VERSION } from "@/types/envelope";
import sampleRaw from "./__fixtures__/sample-envelope-v1.json?raw";
import bignumRaw from "./__fixtures__/sample-envelope-v1-bignum.json?raw";

describe("parseEnvelopeText", () => {
  it("treats blank input as empty, not as an error", () => {
    expect(parseEnvelopeText("")).toEqual({ kind: "empty" });
    expect(parseEnvelopeText("  \n\t ")).toEqual({ kind: "empty" });
  });

  it("accepts a CLI envelope and keeps the original text", () => {
    const r = parseEnvelopeText(sampleRaw);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.envelope.format_version).toBe(ENVELOPE_FORMAT_VERSION);
    expect(r.sourceText).toBe(sampleRaw);
    expect(r.pretty).toBe(JSON.stringify(JSON.parse(sampleRaw), null, 2));
  });

  it("keeps the raw source text of a bignum envelope byte for byte", () => {
    // The signature check canonicalises from this text; a re-serialised copy
    // would round the 64-bit integers and reject a valid signature.
    const minified = JSON.stringify(JSON.parse(bignumRaw));
    const r = parseEnvelopeText(bignumRaw);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.sourceText).toBe(bignumRaw);
    expect(r.sourceText).not.toBe(minified);
    expect(r.sourceText).toContain("9223372036854775807");
  });

  it("reports malformed JSON with a line and column", () => {
    const text = '{\n  "format_version": "envelope.v1",\n  records: []\n}';
    const r = parseEnvelopeText(text);
    expect(r.kind).toBe("invalid");
    if (r.kind !== "invalid") return;
    expect(r.message).toMatch(/^Invalid JSON at line 3, column 3:/);
    expect(r.pretty).toBeUndefined();
  });

  it("reports malformed JSON without a position when the engine gives none", () => {
    // V8's "Unexpected token" message carries no offset.
    const r = parseEnvelopeText('{"records": [,]}');
    expect(r.kind).toBe("invalid");
    if (r.kind !== "invalid") return;
    expect(r.message).toMatch(/^Invalid JSON: /);
  });

  it("rejects valid JSON of the wrong shape and still offers a pretty copy", () => {
    const r = parseEnvelopeText('{"hello":"world"}');
    expect(r.kind).toBe("invalid");
    if (r.kind !== "invalid") return;
    expect(r.message).toMatch(/doesn't look like a SigComply signed-evidence file/);
    expect(r.pretty).toBe('{\n  "hello": "world"\n}');
  });

  it("refuses any format_version other than the supported one", () => {
    const env = JSON.parse(sampleRaw) as Record<string, unknown>;
    env.format_version = "envelope.v2";
    const r = parseEnvelopeText(JSON.stringify(env));
    expect(r.kind).toBe("invalid");
    if (r.kind !== "invalid") return;
    expect(r.message).toBe(
      `Unsupported envelope format_version "envelope.v2". This verifier handles "${ENVELOPE_FORMAT_VERSION}".`,
    );
  });
});

describe("describeJsonError", () => {
  it("turns a V8 position into line and column", () => {
    const src = '{\n  "a": 1,\n  x\n}';
    const err = new SyntaxError(
      "Expected double-quoted property name in JSON at position 14",
    );
    expect(describeJsonError(err, src)).toBe(
      "Invalid JSON at line 3, column 3: Expected double-quoted property name in JSON at position 14",
    );
  });

  it("falls back to the bare message when the engine gives no position", () => {
    // WebKit: no offset in the message.
    const err = new SyntaxError("JSON Parse error: Unexpected identifier \"x\"");
    expect(describeJsonError(err, "x")).toBe(
      'Invalid JSON: JSON Parse error: Unexpected identifier "x"',
    );
  });

  it("clamps a position past the end of the text", () => {
    const err = new SyntaxError("Unexpected end at position 99");
    expect(describeJsonError(err, "{\n")).toBe(
      "Invalid JSON at line 2, column 1: Unexpected end at position 99",
    );
  });
});
