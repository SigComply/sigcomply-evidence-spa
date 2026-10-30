// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { serveJson } from "@/test/component-env";

const soc2 = { framework: "soc2", version: "1.0", entries: [] };
const iso = { framework: "iso27001", version: "1.0", entries: [] };

describe("useCatalog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("loads, then resets and reloads on a framework switch", async () => {
    serveJson({
      "config.json": { frameworks: ["soc2", "iso27001"] },
      "data/catalogs/soc2.json": soc2,
      "data/catalogs/iso27001.json": iso,
    });
    await (await import("@/config/runtime")).loadConfig();
    const { useCatalog } = await import("./useCatalog");
    const { result, rerender } = renderHook(({ fw }) => useCatalog(fw), {
      initialProps: { fw: "soc2" },
    });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.catalog?.framework).toBe("soc2"));
    expect(result.current.loading).toBe(false);

    rerender({ fw: "iso27001" });
    expect(result.current.catalog).toBeNull();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.catalog?.framework).toBe("iso27001"));
  });

  it("reports a missing catalog as an error", async () => {
    serveJson({ "config.json": { frameworks: ["soc2"] } });
    await (await import("@/config/runtime")).loadConfig();
    const { useCatalog } = await import("./useCatalog");
    const { result } = renderHook(() => useCatalog("soc2"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Failed to load catalog for soc2");
    expect(result.current.catalog).toBeNull();
  });

  it("fetches each catalog once", async () => {
    const fetchMock = serveJson({ "config.json": { frameworks: ["soc2"] }, "data/catalogs/soc2.json": soc2 });
    await (await import("@/config/runtime")).loadConfig();
    const { fetchCatalog } = await import("@/data");
    await fetchCatalog("soc2");
    await fetchCatalog("soc2");
    expect(fetchMock).toHaveBeenCalledTimes(2); // config.json, then the catalog once
  });

  it.each(["..%2Fconfig", "../config", "soc2/../iso27001", "SOC2"])(
    "refuses the framework %s without a request",
    async (fw) => {
      const fetchMock = serveJson({ "config.json": { frameworks: ["soc2"] } });
      await (await import("@/config/runtime")).loadConfig();
      const { fetchCatalog } = await import("@/data");
      await expect(fetchCatalog(fw)).rejects.toThrow(/Unknown framework/);
      expect(fetchMock).toHaveBeenCalledTimes(1); // config.json only
    },
  );

  it("refuses a framework that config.json does not list", async () => {
    const fetchMock = serveJson({ "config.json": { frameworks: ["soc2"] }, "data/catalogs/iso27001.json": iso });
    await (await import("@/config/runtime")).loadConfig();
    const { fetchCatalog } = await import("@/data");
    await expect(fetchCatalog("iso27001")).rejects.toThrow(/Unknown framework/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a catalog that doesn't match the catalog types", async () => {
    serveJson({
      "config.json": { frameworks: ["soc2"] },
      "data/catalogs/soc2.json": { framework: "soc2", version: "1.0", entries: [{ id: "../x" }] },
    });
    await (await import("@/config/runtime")).loadConfig();
    const { fetchCatalog } = await import("@/data");
    await expect(fetchCatalog("soc2")).rejects.toThrow(/Invalid catalog for soc2/);
  });
});
