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
    serveJson({ "data/catalogs/soc2.json": soc2, "data/catalogs/iso27001.json": iso });
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
    serveJson({});
    const { useCatalog } = await import("./useCatalog");
    const { result } = renderHook(() => useCatalog("soc2"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Failed to load catalog for soc2");
    expect(result.current.catalog).toBeNull();
  });

  it("fetches each catalog once", async () => {
    const fetchMock = serveJson({ "data/catalogs/soc2.json": soc2 });
    const { fetchCatalog } = await import("@/data");
    await fetchCatalog("soc2");
    await fetchCatalog("soc2");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
