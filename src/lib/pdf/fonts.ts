import { Font } from "@react-pdf/renderer";

// The PDF's only font family: DejaVu Sans (Bitstream Vera licence,
// fonts/LICENSE), embedded and subset by the renderer. The standard
// Helvetica uses WinAnsi, which turned a signer name such as "Łukasz" into
// "Aukasz". The files ship with the app and load from its own origin when
// the first PDF renders; nothing is fetched from anywhere else.
export const PDF_FONT_FAMILY = "DejaVu Sans";

// Vite turns `new URL(..., import.meta.url)` into a bundled asset URL. Under
// Node (Vitest, scripts/render-evidence-pdf.ts) it is a file: URL, which the
// renderer needs as a plain path.
const FACES = [
  { url: new URL("./fonts/DejaVuSans.ttf", import.meta.url) },
  { url: new URL("./fonts/DejaVuSans-Bold.ttf", import.meta.url), fontWeight: "bold" as const },
  { url: new URL("./fonts/DejaVuSans-Oblique.ttf", import.meta.url), fontStyle: "italic" as const },
];

export function fontSource(url: URL): string {
  return url.protocol === "file:" ? decodeURIComponent(url.pathname) : url.href;
}

let registered = false;

export function registerPdfFonts(): void {
  if (registered) return;
  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: FACES.map(({ url, ...face }) => ({ src: fontSource(url), ...face })),
  });
  registered = true;
}
