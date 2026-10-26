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
