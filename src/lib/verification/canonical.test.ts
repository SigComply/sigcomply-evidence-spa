import { describe, expect, it } from "vitest";
import {
  canonicalJSON,
  parseJSONPreservingNumbers,
  LosslessNumber,
} from "./canonical";
import sampleEnvelope from "./__fixtures__/sample-envelope-v1.json";
import canonicalReference from "./__fixtures__/sample-envelope-v1.canonical.txt?raw";
// Imported as raw text (NOT a JSON module): a JSON import would parse the
// 64-bit payload integers through float64 and round them before we ever see
// them, defeating the point of the fixture.
import bignumEnvelopeRaw from "./__fixtures__/sample-envelope-v1-bignum.json?raw";
import bignumCanonical from "./__fixtures__/sample-envelope-v1-bignum.canonical.txt?raw";

describe("canonicalJSON", () => {
  it("encodes the empty object", () => {
    expect(canonicalJSON({})).toBe("{}");
  });

  it("sorts object keys at the top level", () => {
    expect(canonicalJSON({ b: 1, a: 2, c: 3 })).toBe('{"a":2,"b":1,"c":3}');
  });

  it("sorts keys at every nesting level", () => {
    expect(canonicalJSON({ outer: { z: 1, a: 2 } })).toBe(
      '{"outer":{"a":2,"z":1}}',
    );
  });

  it("preserves array order", () => {
    expect(canonicalJSON([3, 1, 2])).toBe("[3,1,2]");
  });

  it("emits no insignificant whitespace", () => {
    expect(canonicalJSON({ a: [1, 2, 3], b: "x" })).toBe(
      '{"a":[1,2,3],"b":"x"}',
    );
  });

  it("encodes primitives like Go's encoding/json", () => {
    expect(canonicalJSON(null)).toBe("null");
    expect(canonicalJSON(true)).toBe("true");
    expect(canonicalJSON(false)).toBe("false");
    expect(canonicalJSON("hello")).toBe('"hello"');
    expect(canonicalJSON(42)).toBe("42");
    expect(canonicalJSON(1.5)).toBe("1.5");
  });

  it("does NOT html-escape <, >, &", () => {
    // The CLI's canonicalizer disables encoding/json's HTML escaping; we
    // must do the same so byte sequences match.
    expect(canonicalJSON({ x: '<a href="y">&amp;</a>' })).toBe(
      '{"x":"<a href=\\"y\\">&amp;</a>"}',
    );
  });

  it("emits \\b \\f \\n \\r \\t as named escapes", () => {
    expect(canonicalJSON("a\bb\fc\nd\re\tf")).toBe('"a\\bb\\fc\\nd\\re\\tf"');
  });

  it("\\u-escapes other control characters", () => {
    // Control codes outside the named-escape set are \u-escaped.
    expect(canonicalJSON("")).toBe('"\\u0001"');
    expect(canonicalJSON("")).toBe('"\\u001f"');
  });

  it("escapes U+2028 / U+2029 like Go's encoding/json", () => {
    expect(canonicalJSON(" ")).toBe('"\\u2028"');
    expect(canonicalJSON(" ")).toBe('"\\u2029"');
  });

  it("escapes embedded quotes and backslashes", () => {
    expect(canonicalJSON('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  it("is deterministic across input key orderings", () => {
    const a = { z: 1, a: 2, m: 3, b: 4 };
    const b = { a: 2, z: 1, b: 4, m: 3 };
    expect(canonicalJSON(a)).toBe(canonicalJSON(b));
  });

  it("matches the CLI's reference canonical bytes for the sample envelope", () => {
    // sample-envelope-v1.canonical.txt was produced by the Go signer's
    // `sign.Encode` against the three signed fields of the fixture
    // envelope. Byte-equality here is the contract.
    const signedBytes = canonicalJSON({
      format_version: sampleEnvelope.format_version,
      produced_at: sampleEnvelope.produced_at,
      records: sampleEnvelope.records,
    });
    expect(signedBytes).toBe(canonicalReference.trimEnd());
  });
});

describe("large-integer preservation (payload ints > 2^53)", () => {
  it("emits a LosslessNumber's source lexeme verbatim", () => {
    expect(canonicalJSON(new LosslessNumber("9223372036854775807"))).toBe(
      "9223372036854775807",
    );
  });

  it("keeps integers above 2^53 that plain JSON.parse would round", () => {
    const src = '{"id":9007199254740993}'; // 2^53 + 1
    // Establish the hazard: a plain parse loses the low bit.
    expect(JSON.stringify(JSON.parse(src))).toBe('{"id":9007199254740992}');
    // The lexeme-preserving parse + canonicalise keeps it exact.
    expect(canonicalJSON(parseJSONPreservingNumbers(src))).toBe(
      '{"id":9007199254740993}',
    );
  });

  it("still round-trips float64-safe numbers unchanged", () => {
    expect(canonicalJSON(parseJSONPreservingNumbers('{"a":42,"b":1.5}'))).toBe(
      '{"a":42,"b":1.5}',
    );
  });

  it("matches the CLI's canonical bytes for a 64-bit payload envelope", () => {
    // sample-envelope-v1-bignum.{json,canonical.txt} were produced by the Go
    // signer against a payload carrying epoch-nanos (1700000000000000123) and
    // int64-max (9223372036854775807). Byte-equality here is the contract.
    const parsed = parseJSONPreservingNumbers(bignumEnvelopeRaw) as {
      format_version: unknown;
      produced_at: unknown;
      records: unknown;
    };
    const signedBytes = canonicalJSON({
      format_version: parsed.format_version,
      produced_at: parsed.produced_at,
      records: parsed.records,
    });
    expect(signedBytes).toBe(bignumCanonical.trimEnd());
  });

  it("a plain JSON.parse round-trip would diverge (documents the bug the fix avoids)", () => {
    const obj = JSON.parse(bignumEnvelopeRaw);
    const lossy = canonicalJSON({
      format_version: obj.format_version,
      produced_at: obj.produced_at,
      records: obj.records,
    });
    expect(lossy).not.toBe(bignumCanonical.trimEnd());
  });
});
