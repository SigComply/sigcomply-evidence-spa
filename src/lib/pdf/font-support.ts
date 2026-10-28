import { FONT_COVERAGE } from "./font-coverage";

function covered(cp: number): boolean {
  let lo = 0;
  let hi = FONT_COVERAGE.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [first, last] = FONT_COVERAGE[mid];
    if (cp < first) hi = mid - 1;
    else if (cp > last) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * The distinct characters of `text` the PDF font can't draw, in order of
 * appearance. Line breaks and tabs are allowed. Compare after NFC
 * normalisation, which is how the text reaches the PDF.
 */
export function unsupportedPdfChars(text: string): string[] {
  const out = new Set<string>();
  for (const ch of text.normalize("NFC")) {
    if (ch === "\n" || ch === "\r" || ch === "\t") continue;
    if (!covered(ch.codePointAt(0)!)) out.add(ch);
  }
  return [...out];
}
