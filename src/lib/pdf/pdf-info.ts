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
