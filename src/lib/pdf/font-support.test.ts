import { describe, expect, it } from "vitest";
import { unsupportedPdfChars } from "./font-support";
import { fontSource } from "./fonts";

describe("unsupportedPdfChars", () => {
  it("allows ASCII, line breaks and tabs", () => {
    expect(unsupportedPdfChars("Jane Doe <jane@example.com>\n\tok")).toEqual([]);
  });

  it("lists each character outside the font once, in order", () => {
    expect(unsupportedPdfChars("张伟 张 🙂 Łukasz")).toEqual(["张", "伟", "🙂"]);
  });

  it("refuses control characters", () => {
    expect(unsupportedPdfChars("a\u0007b")).toEqual(["\u0007"]);
  });
});

describe("fontSource", () => {
  it("turns a file: URL into a path and keeps an http URL", () => {
    expect(fontSource(new URL("file:///tmp/My%20Fonts/a.ttf"))).toBe("/tmp/My Fonts/a.ttf");
    expect(fontSource(new URL("https://example.test/assets/a.ttf"))).toBe(
      "https://example.test/assets/a.ttf",
    );
  });
});
