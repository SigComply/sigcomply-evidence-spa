import { execSync } from "child_process";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { validateCatalog } from "../src/lib/catalog-validate.ts";
import type { Catalog } from "../src/types/catalog.ts";

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

// SPA only renders user-attestation entries. document_upload entries are
// produced externally and uploaded directly to the bucket — filter them out at
// build time so they never reach the browser.
const SPA_RENDERABLE_TYPES = new Set(["declaration", "checklist"]);

/**
 * Parses one framework's CLI output, checks it strictly against
 * src/types/catalog.ts and drops the entries the SPA doesn't render. Throws
 * with every shape error, so a CLI catalog change the types don't describe
 * fails the build.
 */
export function prepareCatalog(
  json: string,
  framework: string,
): { catalog: Catalog; before: number; after: number } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    throw new Error(
      `\`sigcomply evidence catalog --framework ${framework}\` emitted malformed JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err },
    );
  }
  const { catalog, errors } = validateCatalog(raw, framework);
  if (!catalog) {
    throw new Error(
      `catalog for ${framework} does not match src/types/catalog.ts. Update ` +
        `the types (and this check) together with the CLI change:\n  ` +
        errors.join("\n  "),
    );
  }
  const before = catalog.entries.length;
  const entries = catalog.entries.filter((e) => SPA_RENDERABLE_TYPES.has(e.type));
  return { catalog: { ...catalog, entries }, before, after: entries.length };
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

    let prepared: ReturnType<typeof prepareCatalog>;
    try {
      prepared = prepareCatalog(json, fw);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    const { catalog, before, after } = prepared;
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

// Run only when executed (`tsx scripts/fetch-catalogs.ts`), not when a test
// imports prepareCatalog.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
