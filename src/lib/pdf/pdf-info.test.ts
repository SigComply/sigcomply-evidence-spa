import { describe, expect, it } from "vitest";
import { pdfBytesToText, readPdfInfoString } from "./pdf-info";

describe("readPdfInfoString", () => {
  it("reads an inline literal with escapes", () => {
    const pdf = "<< /Title (a \\(b\\) c\\\\) /Keywords (k=v) >>";
    expect(readPdfInfoString(pdf, "Title")).toBe("a (b) c\\");
    expect(readPdfInfoString(pdf, "Keywords")).toBe("k=v");
  });

  it("follows an indirect reference", () => {
    const pdf = "20 0 obj\n(k=v; x=y)\nendobj\n<< /Keywords 20 0 R >>";
    expect(readPdfInfoString(pdf, "Keywords")).toBe("k=v; x=y");
  });

  it("returns null when the key or the object is missing", () => {
    expect(readPdfInfoString("<< /Title (t) >>", "Keywords")).toBeNull();
    expect(readPdfInfoString("<< /Keywords 9 0 R >>", "Keywords")).toBeNull();
  });

  it("decodes bytes as latin1", () => {
    expect(pdfBytesToText(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xe9]))).toBe(
      "%PDFé",
    );
  });
});
