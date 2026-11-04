import { describe, expect, it } from "vitest";
import { parseJSONPreservingNumbers } from "./canonical";
import { prettyJSON } from "./pretty";
import sampleRaw from "./__fixtures__/sample-envelope-v1.json?raw";
import bignumRaw from "./__fixtures__/sample-envelope-v1-bignum.json?raw";
import fanoutRaw from "./__fixtures__/golden/fanout.json?raw";

describe("prettyJSON", () => {
  it("keeps integers above 2^53 digit for digit", () => {
    const out = prettyJSON(parseJSONPreservingNumbers(bignumRaw));
    expect(out).toContain('"epoch_nanos": 1700000000000000123');
    expect(out).toContain('"max_int64": 9223372036854775807');
    expect(out).toContain('"small": 42');
    // JSON.stringify of a plain parse rounds both.
    expect(JSON.stringify(JSON.parse(bignumRaw))).not.toContain("9223372036854775807");
  });

  it.each([
    ["sample", sampleRaw],
    ["fanout", fanoutRaw],
  ])("matches JSON.stringify's 2-space layout when no number is large (%s)", (_n, raw) => {
    expect(prettyJSON(parseJSONPreservingNumbers(raw))).toBe(
      JSON.stringify(JSON.parse(raw), null, 2),
    );
  });

  it("prints empty containers, escapes and literals like JSON.stringify", () => {
    const raw = '{"a":[],"b":{},"c":"q\\"\\u2028<","d":null,"e":true,"f":[1.50,-0,2e3]}';
    const out = prettyJSON(parseJSONPreservingNumbers(raw));
    expect(out).toBe(
      `{\n  "a": [],\n  "b": {},\n  "c": ${JSON.stringify('q"\u2028<')},\n  "d": null,\n  "e": true,\n  "f": [\n    1.50,\n    -0,\n    2e3\n  ]\n}`,
    );
  });
});
