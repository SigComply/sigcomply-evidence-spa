import { execFileSync } from "child_process";
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { FRAMEWORK_PATTERN, validateCatalog } from "../src/lib/catalog-validate.ts";
import type { Catalog } from "../src/types/catalog.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const catalogsDir = join(publicDir, "data", "catalogs");

// public/config.json is the single source of truth for which frameworks the
// UI exposes. Read the prefetch list from it so the shipped catalogs can
// never drift from what the app can actually reach. Each name becomes a CLI
// argument and a file name, so it must be a slug.
export function frameworksFromConfig(raw: string): string[] {
  const config = JSON.parse(raw) as { frameworks?: unknown[] };
  const frameworks = config.frameworks ?? [];
  if (frameworks.length === 0) {
    throw new Error("public/config.json declares no frameworks.");
  }
  for (const fw of frameworks) {
    if (typeof fw !== "string" || !FRAMEWORK_PATTERN.test(fw)) {
      throw new Error(`public/config.json: ${JSON.stringify(fw)} is not a framework name`);
    }
  }
  return frameworks as string[];
}

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

// No shell: the arguments reach the CLI as they are.
function run(file: string, args: string[]): string {
  return execFileSync(file, args, { encoding: "utf-8" }).trim();
}

/**
 * Parses one framework's CLI output, checks it against src/types/catalog.ts
 * and drops the entries the SPA doesn't render (validateCatalog does both).
 * document_upload entries are produced externally and uploaded directly to
 * the bucket, so they never reach the browser. Throws with every shape error
 * in data the SPA reads, so a CLI catalog change the types don't describe
 * fails the build; problems in dropped data are printed as warnings.
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
  const { catalog, errors, warnings, dropped } = validateCatalog(raw, framework);
  if (warnings.length > 0) {
    console.warn(
      `Warning: ${framework} catalog: fields the SPA does not read (not shipped):\n  ` +
        warnings.join("\n  "),
    );
  }
  if (!catalog) {
    throw new Error(
      `catalog for ${framework} does not match src/types/catalog.ts. Update ` +
        `the types (and this check) together with the CLI change:\n  ` +
        errors.join("\n  "),
    );
  }
  const after = catalog.entries.length;
  return { catalog, before: after + dropped, after };
}

function main() {
  // Check sigcomply binary exists
  try {
    run("which", ["sigcomply"]);
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

  let frameworks: string[];
  try {
    frameworks = frameworksFromConfig(readFileSync(join(publicDir, "config.json"), "utf-8"));
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

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
      json = run("sigcomply", ["evidence", "catalog", "--framework", fw, "-o", "json"]);
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
