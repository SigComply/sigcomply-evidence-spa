import { afterEach, describe, expect, it, vi } from "vitest";
import { readPref, writePref } from "./local-prefs";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => Array.from(m.keys())[i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

function throwingStorage(): Storage {
  const fail = () => {
    throw new DOMException("denied", "SecurityError");
  };
  return {
    length: 0,
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  };
}

describe("local prefs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("round-trips a value", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(readPref("sigcomply:x")).toBeNull();
    writePref("sigcomply:x", "soc2");
    expect(readPref("sigcomply:x")).toBe("soc2");
  });

  it("reads null and writes nothing when storage throws", () => {
    // Safari private mode, blocked site data, sandboxed iframes.
    vi.stubGlobal("localStorage", throwingStorage());
    expect(readPref("sigcomply:x")).toBeNull();
    expect(() => writePref("sigcomply:x", "soc2")).not.toThrow();
  });

  it("reads null when localStorage does not exist", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readPref("sigcomply:x")).toBeNull();
    expect(() => writePref("sigcomply:x", "soc2")).not.toThrow();
  });
});
