import { afterEach, describe, expect, it, vi } from "vitest";
import publicConfigRaw from "../../public/config.json?raw";

// The CLI's manual.pdf source reads {prefix}{evidence_id}/{period_id}/ with
// prefix defaulting to "manual/" (sigcomply-cli internal/sources/manual
// defaultPrefix). The upload path this SPA shows must name the same folder for
// a project that keeps the CLI default.
const CLI_DEFAULT_PREFIX = "manual/";

describe("runtime config storage prefix", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("ships public/config.json with the CLI default prefix", () => {
    const parsed = JSON.parse(publicConfigRaw) as {
      storage: { prefix: string };
    };
    expect(parsed.storage.prefix).toBe(CLI_DEFAULT_PREFIX);
  });

  it("falls back to the CLI default prefix when config.json is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    const { loadConfig } = await import("./runtime");
    const config = await loadConfig();
    expect(config.storage.prefix).toBe(CLI_DEFAULT_PREFIX);
  });

  it("falls back to the CLI default prefix when config.json has no storage block", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ frameworks: ["soc2"] }), {
            status: 200,
          }),
        ),
      ),
    );
    const { loadConfig } = await import("./runtime");
    const config = await loadConfig();
    expect(config.storage.prefix).toBe(CLI_DEFAULT_PREFIX);
  });
});

describe("loadConfig", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function serve(body: unknown, init: ResponseInit = { status: 200 }) {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(typeof body === "string" ? body : JSON.stringify(body), init),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  async function load() {
    const mod = await import("./runtime");
    return { config: await mod.loadConfig(), mod };
  }

  it("fetches config.json relative to the base path", async () => {
    const fetchMock = serve({ frameworks: ["soc2"] });
    await load();
    expect(fetchMock).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}config.json`);
  });

  it("keeps a valid override as written", async () => {
    serve({
      frameworks: ["iso27001", "soc2"],
      storage: { show_upload_path: false, prefix: "evidence/manual/" },
    });
    const { config } = await load();
    expect(config).toEqual({
      frameworks: ["iso27001", "soc2"],
      storage: { show_upload_path: false, prefix: "evidence/manual/" },
    });
  });

  it.each([
    ["non-string frameworks dropped", { frameworks: ["soc2", 3, null, "iso27001"] }, ["soc2", "iso27001"]],
    ["empty list falls back", { frameworks: [] }, ["soc2"]],
    ["only non-strings fall back", { frameworks: [1, {}] }, ["soc2"]],
    ["non-array falls back", { frameworks: "soc2" }, ["soc2"]],
    ["missing falls back", {}, ["soc2"]],
  ])("frameworks: %s", async (_name, body, want) => {
    serve(body);
    const { config } = await load();
    expect(config.frameworks).toEqual(want);
  });

  it.each([
    ["false honoured", false, false],
    ["true honoured", true, true],
    ["string coerced to default", "false", true],
    ["number coerced to default", 0, true],
    ["null coerced to default", null, true],
  ])("show_upload_path: %s", async (_name, value, want) => {
    serve({ storage: { show_upload_path: value } });
    const { config } = await load();
    expect(config.storage.show_upload_path).toBe(want);
  });

  it("falls back to the default prefix when prefix is not a string", async () => {
    serve({ storage: { prefix: 42 } });
    const { config } = await load();
    expect(config.storage.prefix).toBe(CLI_DEFAULT_PREFIX);
  });

  it.each([404, 500])("uses the defaults on HTTP %i", async (status) => {
    serve({ frameworks: ["iso27001"] }, { status });
    const { config } = await load();
    expect(config.frameworks).toEqual(["soc2"]);
    expect(config.storage).toEqual({ show_upload_path: true, prefix: CLI_DEFAULT_PREFIX });
  });

  it("uses the defaults when config.json is not JSON", async () => {
    serve("<!doctype html>");
    const { config } = await load();
    expect(config.frameworks).toEqual(["soc2"]);
  });

  it("uses the defaults when config.json is JSON null", async () => {
    serve("null");
    const { config } = await load();
    expect(config.frameworks).toEqual(["soc2"]);
  });

  it("fetches once and caches the result", async () => {
    const fetchMock = serve({ frameworks: ["iso27001"] });
    const { mod } = await load();
    await mod.loadConfig();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mod.getConfig().frameworks).toEqual(["iso27001"]);
  });

  it("getConfig throws before loadConfig", async () => {
    const { getConfig } = await import("./runtime");
    expect(() => getConfig()).toThrow(/Config not loaded/);
  });
});
