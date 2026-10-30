import { describe, expect, it } from "vitest";
import { canonicalJSON, parseJSONPreservingNumbers } from "./canonical";
import { expectedPdfHashes, matchPdfHash } from "./manual";
import { parseEnvelopeText } from "./parse-envelope";
import { sha256Hex, verifyEnvelopeSignature } from "./verify";
import {
  getManualDocumentPayload,
  type EvidenceEnvelope,
  type ManualDocumentPayload,
} from "@/types/envelope";

// The CLI's golden envelope vectors (sigcomply-cli
// internal/sign/testdata/spa-golden/, made by TestSPAGoldenEnvelopes), copied
// here byte for byte; scripts/check-goldens.sh catches drift. Every file in
// the folder is picked up, so a vector the CLI adds is tested once copied.
const dir = "./__fixtures__/golden/";
const envelopeTexts = import.meta.glob<string>("./__fixtures__/golden/*.json", {
  query: "?raw",
  import: "default",
  eager: true,
});
const canonicalTexts = import.meta.glob<string>(
  "./__fixtures__/golden/*.canonical.txt",
  { query: "?raw", import: "default", eager: true },
);
const pdfDataUrls = import.meta.glob<string>("./__fixtures__/golden/*.pdf", {
  query: "?inline",
  import: "default",
  eager: true,
});

function base(path: string, ext: string): string {
  return path.slice(dir.length, path.length - ext.length);
}

const vectors = Object.entries(envelopeTexts).map(([path, text]) => {
  const name = base(path, ".json");
  return { name, text, canonical: canonicalTexts[`${dir}${name}.canonical.txt`] };
});

// <vector>.<folder>.pdf, where folder is the vault folder name: the
// evidence_id, or <evidence_id>.<member_id> for a fan-out member.
const pdfs = Object.entries(pdfDataUrls).map(([path, dataUrl]) => {
  const stem = base(path, ".pdf");
  const dot = stem.indexOf(".");
  return { vector: stem.slice(0, dot), folder: stem.slice(dot + 1), dataUrl };
});

function dataUrlBytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parse(text: string): EvidenceEnvelope {
  const r = parseEnvelopeText(text);
  if (r.kind !== "ok") throw new Error(`golden envelope rejected: ${JSON.stringify(r)}`);
  return r.envelope;
}

function manualPayload(vector: string): ManualDocumentPayload {
  const v = vectors.find((x) => x.name === vector);
  if (!v) throw new Error(`no envelope for ${vector}`);
  const p = getManualDocumentPayload(parse(v.text));
  if (!p) throw new Error(`${vector} has no manual record`);
  return p;
}

describe("CLI golden envelopes", () => {
  it("has the vectors the CLI generates, each with its canonical bytes", () => {
    expect(vectors.map((v) => v.name).sort()).toEqual(
      ["basic", "bignum", "fanout", "manual", "unicodekeys"],
    );
    for (const v of vectors) expect(v.canonical, v.name).toBeTypeOf("string");
  });

  describe.each(vectors)("$name", ({ text, canonical }) => {
    it("verifies with the /verify code", async () => {
      const result = await verifyEnvelopeSignature(parse(text), text);
      expect(result.reason).toBeUndefined();
      expect(result.valid).toBe(true);
    });

    it("signs exactly the CLI's canonical bytes", async () => {
      const result = await verifyEnvelopeSignature(parse(text), text);
      expect(result.signedBytes).toBe(canonical);
    });

    it("is stored as the canonical JSON of the whole envelope plus a newline", () => {
      expect(canonicalJSON(parseJSONPreservingNumbers(text))).toBe(text.slice(0, -1));
      expect(text.endsWith("}\n")).toBe(true);
    });

    it("fails after a one-byte change to the signed content", async () => {
      const at = text.indexOf('"produced_at":"') + '"produced_at":"'.length;
      const tampered = `${text.slice(0, at)}${text[at] === "2" ? "3" : "2"}${text.slice(at + 1)}`;
      expect(tampered.length).toBe(text.length);
      const result = await verifyEnvelopeSignature(parse(tampered), tampered);
      expect(result.valid).toBe(false);
    });
  });
});

describe("CLI golden manual PDFs", () => {
  it("covers every hash the manual records attest to", () => {
    for (const vector of ["manual", "fanout"]) {
      const wanted = expectedPdfHashes(manualPayload(vector));
      const have = pdfs.filter((p) => p.vector === vector);
      expect(wanted.length, vector).toBeGreaterThan(0);
      expect(have.length, vector).toBe(wanted.length);
    }
  });

  describe.each(pdfs)("$vector.$folder.pdf", ({ vector, folder, dataUrl }) => {
    const payload = () => manualPayload(vector);
    // A fan-out member's folder is <evidence_id>.<member_id>.
    const memberId = folder === payload().evidence_id
      ? undefined
      : folder.slice(`${payload().evidence_id}.`.length);

    it("matches its record's file_hash", async () => {
      const hex = await sha256Hex(dataUrlBytes(dataUrl).buffer);
      const match = matchPdfHash(payload(), hex);
      expect(match).not.toBeNull();
      expect(match?.memberId).toBe(memberId);
    });

    it("no longer matches after a one-byte change", async () => {
      const bytes = dataUrlBytes(dataUrl);
      bytes[bytes.length - 1] ^= 0x01;
      expect(matchPdfHash(payload(), await sha256Hex(bytes.buffer))).toBeNull();
    });
  });
});
