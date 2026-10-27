// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./clipboard";
import { downloadBlob } from "./download";

describe("copyText", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the async clipboard when it exists", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyText("manual/x/2026/evidence.pdf")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("manual/x/2026/evidence.pdf");
  });

  it("falls back to execCommand when the clipboard API rejects", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: () => Promise.reject(new Error("insecure")) },
    });
    const exec = vi.fn(() => true);
    document.execCommand = exec;
    expect(await copyText("p")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("returns false when nothing can copy", async () => {
    vi.stubGlobal("navigator", {});
    document.execCommand = () => {
      throw new Error("unsupported");
    };
    expect(await copyText("p")).toBe(false);
  });
});

describe("downloadBlob", () => {
  afterEach(() => vi.restoreAllMocks());

  it("clicks a temporary link with the file name and revokes the URL", () => {
    const create = vi.fn(() => "blob:test/1");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    const blob = new Blob(["%PDF"], { type: "application/pdf" });
    downloadBlob(blob, "evidence.pdf");

    expect(create).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe("evidence.pdf");
    expect(link.href).toBe("blob:test/1");
    expect(revoke).toHaveBeenCalledWith("blob:test/1");
    expect(document.querySelector("a")).toBeNull();
  });
});
