import { inflateSync } from "node:zlib";

// Reads one literal string from a PDF's Info dictionary. Test helper for the
// unit, script and Playwright tests, which assert the `keywords` contract on
// real rendered bytes. @react-pdf writes Info values uncompressed, either
// inline (`/Keywords (...)`) or as an indirect object (`/Keywords 20 0 R`).
// Not a PDF parser: it handles only literal strings with \\, \( and \) escapes.

function unescapeLiteral(s: string): string {
  return s.replace(/\\([\\()])/g, "$1");
}

const LITERAL = String.raw`\(((?:\\.|[^\\)])*)\)`;

export function readPdfInfoString(
  pdfText: string,
  key: string,
): string | null {
  const direct = new RegExp(String.raw`/${key}\s*` + LITERAL).exec(pdfText);
  if (direct) return unescapeLiteral(direct[1]);
  const ref = new RegExp(String.raw`/${key}\s+(\d+)\s+(\d+)\s+R`).exec(pdfText);
  if (!ref) return null;
  const obj = new RegExp(
    String.raw`(?:^|\s)${ref[1]}\s+${ref[2]}\s+obj\s*` + LITERAL,
  ).exec(pdfText);
  return obj ? unescapeLiteral(obj[1]) : null;
}

/** Decodes PDF bytes one byte per char, so offsets and ASCII survive. */
export function pdfBytesToText(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

const STREAM = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
const TEXT_OBJECT = /\bBT\b([\s\S]*?)\bET\b/g;
const HEX_STRING = /<([0-9A-Fa-f\s]*)>/g;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * The text of each text object (BT … ET) in the PDF's content streams, in
 * drawing order. One run is one styled piece of a line: a checklist box and
 * its item text are separate runs. Test helper, not a PDF parser: it reads
 * what @react-pdf writes for the standard 14 fonts (FlateDecode streams, hex
 * strings in TJ arrays, WinAnsi codes). An embedded font would encode glyph
 * IDs instead, and the tests using this would fail loudly.
 */
export function readPdfTextRuns(bytes: ArrayBuffer | Uint8Array): string[] {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const text = pdfBytesToText(buf);
  const decoder = new TextDecoder("windows-1252");
  const runs: string[] = [];
  for (const m of text.matchAll(STREAM)) {
    const start = m.index + m[0].indexOf("\n") + 1;
    let content: string;
    try {
      content = pdfBytesToText(
        inflateSync(buf.subarray(start, start + m[1].length)),
      );
    } catch {
      continue; // not a Flate stream (an image or an uncompressed object)
    }
    for (const bt of content.matchAll(TEXT_OBJECT)) {
      const pieces = [...bt[1].matchAll(HEX_STRING)].map((h) =>
        decoder.decode(hexToBytes(h[1])),
      );
      runs.push(pieces.join(""));
    }
  }
  return runs;
}

/**
 * Text runs joined with line breaks undone, for "the body contains X"
 * checks: @react-pdf wraps and hyphenates long text across runs, so this
 * drops a run's trailing hyphen and all whitespace. Pass the expected text
 * through `squashText` before comparing.
 */
export function joinTextRuns(runs: string[]): string {
  return squashText(runs.map((r) => r.replace(/-$/, "")).join(""));
}

export function squashText(s: string): string {
  return s.replace(/\s+/g, "");
}
