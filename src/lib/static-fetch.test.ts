import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStatic } from "./static-fetch";

describe("fetchStatic", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub() {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it.each(["config.json", "data/catalogs/soc2.json", "data/catalogs/iso27001.json"])(
    "fetches %s relative to the base path",
    async (path) => {
      const fetchMock = stub();
      await fetchStatic(path);
      expect(fetchMock).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}${path}`);
    },
  );

  it.each([
    "data/catalogs/../config.json",
    "data/catalogs/..%2Fconfig.json",
    "data/catalogs/%2e%2e/x.json",
    "data/catalogs/soc2.json?x=1",
    "data/catalogs/sub/soc2.json",
    "/config.json",
    "https://example.invalid/config.json",
    "assets/index.js",
  ])("refuses %s without a request", async (path) => {
    const fetchMock = stub();
    await expect(fetchStatic(path)).rejects.toThrow(/not an app data path/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
