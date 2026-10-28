import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import {
  joinTextRuns,
  pdfBytesToText,
  readPdfInfoString,
  readPdfTextRuns,
  squashText,
} from "./pdf-info";

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

  it("decodes UTF-16BE behind a byte order mark, literal or hex", () => {
    // "Vendor’s – Zoë" in UTF-16BE. In a literal, bytes such as 0x0A and
    // 0x29 arrive escaped (the last case).
    const utf16 = "\u00fe\u00ff\0V\0e\0n\0d\0o\0r\u0020\u0019\0s\0 \u0020\u0013\0 \0Z\0o\0\u00eb";
    const literal = utf16.replace(/[()\\]/g, "\\$&");
    expect(readPdfInfoString(`<< /Title (${literal}) >>`, "Title")).toBe("Vendor’s – Zoë");
    const hex = [...utf16].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    expect(readPdfInfoString(`<< /Title <${hex.toUpperCase()}> >>`, "Title")).toBe("Vendor’s – Zoë");
    expect(readPdfInfoString("<< /Title (\\376\\377\\000\\n\\000\\)) >>", "Title")).toBe("\n)");
  });

  it("resolves the literal escapes", () => {
    expect(readPdfInfoString("<< /T (a\\tb\\\nc\\101) >>", "T")).toBe("a\tbcA");
  });

  it("returns null when the key or the object is missing", () => {
    expect(readPdfInfoString("<< /Title (t) >>", "Keywords")).toBeNull();
    expect(readPdfInfoString("<< /Keywords 9 0 R >>", "Keywords")).toBeNull();
  });

  it("decodes one char per byte", () => {
    expect(pdfBytesToText(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xe9, 0x80]))).toBe(
      "%PDFé\u0080",
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

describe("joinTextRuns", () => {
  it("undoes line breaks and break hyphens", () => {
    expect(joinTextRuns(["I confirm all acknowl-", "edged it. ", "Accepted: ", "YES"])).toBe(
      squashText("I confirm all acknowledged it. Accepted: YES"),
    );
  });
});
