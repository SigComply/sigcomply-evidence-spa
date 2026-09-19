import { execSync } from "child_process";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const catalogsDir = join(publicDir, "data", "catalogs");

// public/config.json is the single source of truth for which frameworks the
// UI exposes. Read the prefetch list from it so the shipped catalogs can
// never drift from what the app can actually reach.
function frameworksFromConfig(): string[] {
  const raw = readFileSync(join(publicDir, "config.json"), "utf-8");
  const config = JSON.parse(raw) as { frameworks?: string[] };
  const frameworks = config.frameworks ?? [];
  if (frameworks.length === 0) {
    fail("public/config.json declares no frameworks.");
  }
  return frameworks;
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function run(cmd: string): string {
  // Build-time only. `cmd` is composed from the framework list in
  // public/config.json (a repo-controlled file); never user input. Script
  // is not shipped in the SPA bundle.
  // (Semgrep suppression for this file lives in .semgrepignore.)
  return execSync(cmd, { encoding: "utf-8" }).trim();
}

function main() {
  // Check sigcomply binary exists
  try {
    run("which sigcomply");
  } catch {
    fail(
      "sigcomply binary not found on PATH.\n" +
        "Install the CLI (https://github.com/SigComply/sigcomply-cli/releases) " +
        "before running fetch-catalogs / npm run build.\n" +
        "For dev and preview, the committed public/data/catalogs/*.json are " +
        "sufficient — run `npm run dev` or `npx vite build` instead."
    );
  }

  mkdirSync(catalogsDir, { recursive: true });

  const frameworks = frameworksFromConfig();
  // SPA only renders user-attestation entries. document_upload entries are
  // produced externally and uploaded directly to the bucket — filter them
  // out at build time so they never reach the browser.
  const SPA_RENDERABLE_TYPES = new Set(["declaration", "checklist"]);

  for (const fw of frameworks) {
    console.log(`Fetching catalog for ${fw}...`);

    // Every failure below is fatal, deliberately. A framework listed in
    // public/config.json that the CLI cannot serve is a real error: the CLI
    // exits non-zero for an unknown framework or one with no manual catalog,
    // and the UI would offer that framework with a stale (or missing)
    // catalog behind it. Warning-and-continuing here is what let a broken
    // CLI invocation produce a green deploy serving last month's catalogs.
    let json: string;
    try {
      json = run(`sigcomply evidence catalog --framework ${fw} -o json`);
    } catch (err) {
      fail(
        `\`sigcomply evidence catalog --framework ${fw}\` failed: ${
          err instanceof Error ? err.message : String(err)
        }\n` +
          `\`${fw}\` is listed in public/config.json, so the CLI must be able ` +
          `to serve its manual catalog. Remove it from config.json or upgrade the CLI.`
      );
    }

    let catalog: { entries?: unknown };
    try {
      catalog = JSON.parse(json) as { entries?: unknown };
    } catch (err) {
      fail(
        `\`sigcomply evidence catalog --framework ${fw}\` emitted malformed JSON: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    if (!Array.isArray(catalog.entries)) {
      fail(
        `catalog for ${fw} has no \`entries\` array — the CLI's catalog shape ` +
          `has changed or the wrong command output was captured.`
      );
    }

    const entries = catalog.entries as Array<{ type: string }>;
    const before = entries.length;
    catalog.entries = entries.filter((e) => SPA_RENDERABLE_TYPES.has(e.type));
    const after = (catalog.entries as unknown[]).length;
    writeFileSync(
      join(catalogsDir, `${fw}.json`),
      JSON.stringify(catalog, null, 2) + "\n"
    );
    console.log(
      `  -> public/data/catalogs/${fw}.json (${after}/${before} entries, ${before - after} document_upload filtered)`
    );
  }

  console.log("Done.");
}

main();
