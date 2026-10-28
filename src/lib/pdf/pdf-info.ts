import { inflateSync } from "node:zlib";

// Reads one string from a PDF's Info dictionary. Test helper for the unit,
// script and Playwright tests, which assert the `keywords` contract on real
// rendered bytes. @react-pdf writes Info values uncompressed, either inline
// (`/Keywords (...)`) or as an indirect object (`/Keywords 20 0 R`), as a
// literal or hex string. A value outside ASCII (a ’ or – in a catalog name,
// an accented signer) is UTF-16BE behind a FE FF byte order mark. Not a PDF
// parser: it handles the string forms and escapes the PDF spec defines.

const ESCAPES: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
};

/** A literal string's escapes resolved, one char per byte. */
function unescapeLiteral(s: string): string {
  return s
    .replace(/\\\r?\n/g, "") // a backslash at a line end continues the string
    .replace(/\\([0-7]{1,3})|\\(.)/gs, (_m, octal: string, c: string) =>
      octal ? String.fromCharCode(parseInt(octal, 8) & 0xff) : (ESCAPES[c] ?? c),
    );
}

function unhex(s: string): string {
  const clean = s.replace(/\s+/g, "");
  const padded = clean.length % 2 ? `${clean}0` : clean;
  let out = "";
  for (let i = 0; i < padded.length; i += 2) {
    out += String.fromCharCode(parseInt(padded.slice(i, i + 2), 16));
  }
  return out;
}

/** One char per byte → text: UTF-16BE behind a BOM, else the bytes as is. */
function decodeTextString(bytes: string): string {
  if (!bytes.startsWith("\u00fe\u00ff")) return bytes;
  let out = "";
  for (let i = 2; i + 1 < bytes.length; i += 2) {
    out += String.fromCharCode((bytes.charCodeAt(i) << 8) | bytes.charCodeAt(i + 1));
  }
  return out;
}

const STRING = String.raw`(?:\(((?:\\[\s\S]|[^\\)])*)\)|<([0-9A-Fa-f\s]*)>)`;

function stringValue(m: RegExpExecArray): string {
  const bytes = m[1] !== undefined ? unescapeLiteral(m[1]) : unhex(m[2]);
  return decodeTextString(bytes);
}

export function readPdfInfoString(
  pdfText: string,
  key: string,
): string | null {
  const direct = new RegExp(String.raw`/${key}\s*` + STRING).exec(pdfText);
  if (direct) return stringValue(direct);
  const ref = new RegExp(String.raw`/${key}\s+(\d+)\s+(\d+)\s+R`).exec(pdfText);
  if (!ref) return null;
  const obj = new RegExp(
    String.raw`(?:^|\s)${ref[1]}\s+${ref[2]}\s+obj\s*` + STRING,
  ).exec(pdfText);
  return obj ? stringValue(obj) : null;
}

/**
 * Decodes PDF bytes one byte per char (U+0000–U+00FF), so offsets, ASCII
 * and the raw bytes of a UTF-16 string survive.
 */
export function pdfBytesToText(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    out += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return out;
}

const STREAM = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
const TEXT_OBJECT = /\bBT\b([\s\S]*?)\bET\b/g;
// A font selection (`/F2 11 Tf`) or a hex string, in drawing order.
const TEXT_TOKEN = /\/([^\s/<>[\]()]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f\s]*)>/g;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** UTF-16BE hex (code units may be space-separated) → text. */
function utf16Hex(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i + 4 <= clean.length; i += 4) {
    out += String.fromCharCode(parseInt(clean.slice(i, i + 4), 16));
  }
  return out;
}

/** Inflates the stream of object `num`, or null when it has none. */
function objectStream(buf: Uint8Array, text: string, num: string): string | null {
  const m = new RegExp(String.raw`(?:^|\s)${num}\s+0\s+obj\b[\s\S]*?stream\r?\n`).exec(text);
  if (!m) return null;
  const start = m.index + m[0].length;
  const end = /\r?\nendstream/.exec(text.slice(start));
  if (!end) return null;
  try {
    return pdfBytesToText(inflateSync(buf.subarray(start, start + end.index)));
  } catch {
    return null;
  }
}

/** A ToUnicode CMap's bfchar and bfrange entries as code → text. */
function parseToUnicode(cmap: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f\s]+)>/g)) {
      map.set(parseInt(m[1], 16), utf16Hex(m[2]));
    }
  }
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const entry = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:\[([^\]]*)\]|<([0-9A-Fa-f\s]+)>)/g;
    for (const m of block[1].matchAll(entry)) {
      const first = parseInt(m[1], 16);
      const last = parseInt(m[2], 16);
      if (m[3] !== undefined) {
        [...m[3].matchAll(/<([0-9A-Fa-f\s]+)>/g)].forEach((d, i) => {
          if (first + i <= last) map.set(first + i, utf16Hex(d[1]));
        });
      } else {
        const base = utf16Hex(m[4]);
        const lastUnit = base.charCodeAt(base.length - 1);
        for (let c = first; c <= last; c++) {
          map.set(c, base.slice(0, -1) + String.fromCharCode(lastUnit + c - first));
        }
      }
    }
  }
  return map;
}

/** Font resource name (`F2`) → its ToUnicode map, for embedded fonts. */
function fontMaps(buf: Uint8Array, text: string): Map<string, Map<number, string>> {
  const maps = new Map<string, Map<number, string>>();
  for (const dict of text.matchAll(/\/Font\s*<<([\s\S]*?)>>/g)) {
    for (const ref of dict[1].matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+0\s+R/g)) {
      const font = new RegExp(String.raw`(?:^|\s)${ref[2]}\s+0\s+obj\s*<<([\s\S]*?)>>`).exec(text);
      const toUnicode = font && /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(font[1]);
      const cmap = toUnicode && objectStream(buf, text, toUnicode[1]);
      if (cmap) maps.set(ref[1], parseToUnicode(cmap));
    }
  }
  return maps;
}

/**
 * The text of each text object (BT … ET) in the PDF's content streams, in
 * drawing order. One run is one styled piece of a line: a checklist box and
 * its item text are separate runs, and the renderer also splits a line where
 * the script changes (a "·" between words). Test helper, not a PDF parser:
 * it reads what @react-pdf writes (FlateDecode streams, hex strings in TJ
 * arrays). An embedded font's two-byte glyph codes are mapped through the
 * font's ToUnicode CMap; a standard font's bytes are read as WinAnsi.
 */
export function readPdfTextRuns(bytes: ArrayBuffer | Uint8Array): string[] {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const text = pdfBytesToText(buf);
  const maps = fontMaps(buf, text);
  const winAnsi = new TextDecoder("windows-1252");
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
    let map: Map<number, string> | undefined;
    for (const bt of content.matchAll(TEXT_OBJECT)) {
      let run = "";
      for (const tok of bt[1].matchAll(TEXT_TOKEN)) {
        if (tok[1] !== undefined) {
          map = maps.get(tok[1]);
          continue;
        }
        if (!map) {
          run += winAnsi.decode(hexToBytes(tok[2]));
          continue;
        }
        const hex = tok[2].replace(/\s+/g, "");
        for (let i = 0; i + 4 <= hex.length; i += 4) {
          run += map.get(parseInt(hex.slice(i, i + 4), 16)) ?? "�";
        }
      }
      runs.push(run);
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
