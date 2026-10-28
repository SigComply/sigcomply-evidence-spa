import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { pdfBytesToText, readPdfInfoString, readPdfTextRuns } from "./pdf-info";

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

describe("readPdfTextRuns", () => {
  it("decodes the hex strings of each text object in Flate streams", () => {
    const content = deflateSync(
      "BT /F1 10 Tf [<5369676e6564> 0 <20627997> -20] TJ ET\nBT [<58>] TJ ET",
    );
    const pdf = Buffer.concat([
      Buffer.from("1 0 obj << /Length 9 >> stream\nBT (raw) ET\nendstream\n"),
      Buffer.from("2 0 obj << /Filter /FlateDecode >> stream\n"),
      content,
      Buffer.from("\nendstream\n%%EOF"),
    ]);
    // 0x97 is an em dash in WinAnsi; the uncompressed stream is skipped.
    expect(readPdfTextRuns(new Uint8Array(pdf))).toEqual(["Signed by\u2014", "X"]);
  });
});
