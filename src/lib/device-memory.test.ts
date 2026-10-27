import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDeviceRecord, markGenerated, setUploadedAck } from "./device-memory";

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

describe("device memory", () => {
  let store: Storage;
  beforeEach(() => {
    store = memoryStorage();
    vi.stubGlobal("localStorage", store);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("records generation and upload per framework, entry and period", () => {
    markGenerated("soc2", "code_of_conduct", "2026");
    setUploadedAck("soc2", "code_of_conduct", "2026", true);
    expect(getDeviceRecord("soc2", "code_of_conduct", "2026")).toEqual({
      generatedAt: "2026-10-27T10:00:00.000Z",
      uploadedAt: "2026-10-27T10:00:00.000Z",
    });
    expect(getDeviceRecord("soc2", "code_of_conduct", "2025")).toBeUndefined();
    expect(getDeviceRecord("iso27001", "code_of_conduct", "2026")).toBeUndefined();
  });

  it("clears the upload ack", () => {
    setUploadedAck("soc2", "x", "2026", true);
    setUploadedAck("soc2", "x", "2026", false);
    expect(getDeviceRecord("soc2", "x", "2026")?.uploadedAt).toBeUndefined();
  });

  it("treats corrupt or non-object storage as empty", () => {
    store.setItem("sigcomply:device-memory", "{not json");
    expect(getDeviceRecord("soc2", "x", "2026")).toBeUndefined();
    store.setItem("sigcomply:device-memory", "42");
    expect(getDeviceRecord("soc2", "x", "2026")).toBeUndefined();
  });

  it("never throws when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    });
    expect(() => markGenerated("soc2", "x", "2026")).not.toThrow();
    expect(getDeviceRecord("soc2", "x", "2026")).toBeUndefined();
  });
});
