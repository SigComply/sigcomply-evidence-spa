// Collects the form links the installed `sigcomply` CLI prints in a failed
// `check`, one empty project per framework in public/config.json, and writes
// them to a JSON file: [{ "framework": "soc2", "url": "https://..." }, ...].
// deploy.yml runs it after installing the latest CLI release; the smoke job
// then opens every link on the live site (e2e/form-links.live.spec.ts).
//
//   tsx scripts/collect-form-links.ts --out <file>   # or: npm run collect-form-links -- --out <file>
//
// Each project has only a local manual-evidence folder (empty) and a local
// vault, so the run is offline: every manual policy fails and the CLI exits 1,
// printing "↳ fill in the form: <url>" under each declaration and checklist
// policy. Any other exit code, or a framework with no link, fails the script.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { frameworksFromConfig } from "./fetch-catalogs.ts";

export type FormLink = { framework: string; url: string };
export type CheckRun = { status: number | null; stdout: string; stderr: string };

// The line internal/orchestrator/orchestrator.go prints under a failing
// policy that has a form. Anchored, so a reason that merely quotes the
// phrase doesn't count.
const FORM_LINE = /^\s*↳ fill in the form: (\S+)\s*$/;
// eslint-disable-next-line no-control-regex -- strips terminal colour codes
const ANSI = /\u001b\[[0-9;]*m/g;

/** Every form link in `sigcomply check` output, in order, without duplicates. */
export function extractFormLinks(stdout: string): string[] {
  const links: string[] = [];
  for (const line of stdout.replace(ANSI, "").split(/\r?\n/)) {
    const url = FORM_LINE.exec(line)?.[1];
    if (url && !links.includes(url)) links.push(url);
  }
  return links;
}

/**
 * A minimal .sigcomply.yaml: the framework, a local vault and a local
 * manual.pdf source under root. No cloud block, so nothing is submitted.
 */
export function projectConfig(framework: string, root: string): string {
  // The paths go into YAML unquoted; a temp dir never needs quoting, so
  // refuse anything that would rather than escape it.
  if (!/^[A-Za-z0-9._/-]+$/.test(root)) {
    throw new Error(`temp project path ${JSON.stringify(root)} needs YAML quoting`);
  }
  return (
    "schema_version: project.v1\n" +
    `framework: ${framework}\n` +
    `vault:\n  backend: local\n  path: ${root}/vault\n` +
    `sources:\n  manual.pdf:\n    backend: local\n    path: ${root}/evidence\n`
  );
}

/** The environment without cloud credentials, so the run can't reach a real account. */
export function cliEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !/^(AWS|GOOGLE|CLOUDSDK|AZURE)_/.test(key)),
  );
}

/** Runs check for each framework and returns every link, tagged with its framework. */
export function collectFormLinks(
  frameworks: string[],
  runCheck: (framework: string) => CheckRun,
): FormLink[] {
  if (frameworks.length === 0) throw new Error("no frameworks to check");
  const all: FormLink[] = [];
  for (const framework of frameworks) {
    const run = runCheck(framework);
    if (run.status !== 1) {
      throw new Error(
        `\`sigcomply check\` for ${framework} exited with ${run.status}, expected 1 ` +
          `(failing manual policies):\n${run.stderr}\n${run.stdout}`,
      );
    }
    const links = extractFormLinks(run.stdout);
    if (links.length === 0) {
      throw new Error(
        `\`sigcomply check\` for ${framework} printed no "fill in the form" link:\n${run.stdout}`,
      );
    }
    all.push(...links.map((url) => ({ framework, url })));
  }
  return all;
}

function runCheckIn(framework: string): CheckRun {
  const root = mkdtempSync(join(tmpdir(), `form-links-${framework}-`));
  try {
    mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, ".sigcomply.yaml"), projectConfig(framework, root));
    // No shell. --no-cloud on top of the missing cloud block.
    const res = spawnSync("sigcomply", ["check", "--no-cloud"], {
      cwd: root,
      env: cliEnv(process.env),
      encoding: "utf-8",
      timeout: 120_000,
    });
    if (res.error) throw res.error;
    return { status: res.status, stdout: res.stdout, stderr: res.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  const i = process.argv.indexOf("--out");
  const out = i > 0 ? process.argv[i + 1] : undefined;
  if (!out) {
    console.error("usage: collect-form-links --out <file>");
    process.exit(2);
  }
  const configPath = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "config.json");
  try {
    const links = collectFormLinks(
      frameworksFromConfig(readFileSync(configPath, "utf-8")),
      runCheckIn,
    );
    writeFileSync(out, JSON.stringify(links, null, 2) + "\n");
    console.log(`${links.length} form links -> ${out}`);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
