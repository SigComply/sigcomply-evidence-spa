import { describe, expect, it } from "vitest";
import {
  cliEnv,
  collectFormLinks,
  extractFormLinks,
  projectConfig,
  type CheckRun,
} from "./collect-form-links.ts";

const BASE = "https://sigcomply.github.io/sigcomply-evidence-spa/";

// The shape `sigcomply check` prints (internal/orchestrator/orchestrator.go):
// one status line per policy, then indented reason and form-link lines.
function checkOutput(framework: string, ids: string[]): string {
  return [
    `SigComply check ${framework}/2026 — ${ids.length + 1} policies`,
    `  pass=0 fail=${ids.length + 1} carried=0 skip=0 error=0 na=0 waived=0`,
    ...ids.flatMap((id) => [
      `  [fail] ${framework}.${id} — X.1`,
      `      ↳ manual evidence not found; expected files in: file:///tmp/p/evidence/manual/${id}/2026/`,
      `      ↳ fill in the form: ${BASE}evidence/${framework}/${id}`,
    ]),
    // A document_upload entry: a reason, no form link.
    `  [fail] ${framework}.training — X.2`,
    `      ↳ manual evidence not found; expected files in: file:///tmp/p/evidence/manual/training/2026/`,
    "",
  ].join("\n");
}

describe("extractFormLinks", () => {
  it("returns every printed form link in order", () => {
    expect(extractFormLinks(checkOutput("soc2", ["a", "b"]))).toEqual([
      `${BASE}evidence/soc2/a`,
      `${BASE}evidence/soc2/b`,
    ]);
  });

  it("ignores the other reason lines and text that only mentions the phrase", () => {
    const out = [
      "      ↳ manual evidence not found",
      "note: fill in the form: https://example.com/x later",
      "",
    ].join("\n");
    expect(extractFormLinks(out)).toEqual([]);
  });

  it("drops duplicates and tolerates CRLF and colour codes", () => {
    const line = `      ↳ fill in the form: ${BASE}evidence/soc2/a`;
    const out = `${line}\r\n\u001b[2m${line}\u001b[0m\n`;
    expect(extractFormLinks(out)).toEqual([`${BASE}evidence/soc2/a`]);
  });
});

describe("projectConfig", () => {
  it("writes a local vault and a local manual source, and no cloud block", () => {
    const yaml = projectConfig("iso27001", "/tmp/p");
    expect(yaml).toContain("framework: iso27001\n");
    expect(yaml).toContain("vault:\n  backend: local\n  path: /tmp/p/vault\n");
    expect(yaml).toContain("  manual.pdf:\n    backend: local\n    path: /tmp/p/evidence\n");
    expect(yaml).not.toContain("cloud");
  });

  it("refuses a path that would need YAML quoting", () => {
    expect(() => projectConfig("soc2", "/tmp/a: b")).toThrow(/path/);
  });
});

describe("cliEnv", () => {
  it("strips cloud credentials and keeps the rest", () => {
    const env = cliEnv({
      PATH: "/usr/bin",
      HOME: "/home/u",
      AWS_ACCESS_KEY_ID: "x",
      AWS_PROFILE: "p",
      GOOGLE_APPLICATION_CREDENTIALS: "/k.json",
      CLOUDSDK_CONFIG: "/c",
      AZURE_CLIENT_ID: "id",
      ARM_CLIENT_ID: "kept",
    });
    expect(env).toEqual({ PATH: "/usr/bin", HOME: "/home/u", ARM_CLIENT_ID: "kept" });
  });
});

describe("collectFormLinks", () => {
  const ok = (stdout: string): CheckRun => ({ status: 1, stdout, stderr: "" });

  it("collects the links of every framework, tagged with it", () => {
    const runs: Record<string, CheckRun> = {
      soc2: ok(checkOutput("soc2", ["a"])),
      iso27001: ok(checkOutput("iso27001", ["b", "c"])),
    };
    expect(collectFormLinks(["soc2", "iso27001"], (fw) => runs[fw])).toEqual([
      { framework: "soc2", url: `${BASE}evidence/soc2/a` },
      { framework: "iso27001", url: `${BASE}evidence/iso27001/b` },
      { framework: "iso27001", url: `${BASE}evidence/iso27001/c` },
    ]);
  });

  it("fails when a run does not exit 1", () => {
    for (const status of [0, 2, 3, null]) {
      expect(() =>
        collectFormLinks(["soc2"], () => ({ status, stdout: "", stderr: "boom" })),
      ).toThrow(/soc2.*exited with .*expected 1[\s\S]*boom/);
    }
  });

  it("fails when a framework prints no form link", () => {
    expect(() =>
      collectFormLinks(["soc2", "iso27001"], (fw) =>
        ok(checkOutput(fw, fw === "soc2" ? ["a"] : [])),
      ),
    ).toThrow(/iso27001.*no "fill in the form" link/);
  });

  it("fails when the frameworks list is empty", () => {
    expect(() => collectFormLinks([], () => ok(""))).toThrow(/no frameworks/);
  });
});
