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
    console.error("Error: public/config.json declares no frameworks.");
    process.exit(1);
  }
  return frameworks;
}

function run(cmd: string): string {
  // Build-time only. `cmd` is composed from a hardcoded framework list
  // (line 27); never user input. Script is not shipped in the SPA bundle.
  // (Semgrep suppression for this file lives in .semgrepignore.)
  return execSync(cmd, { encoding: "utf-8" }).trim();
}

function main() {
  // Check sigcomply binary exists
  try {
    run("which sigcomply");
  } catch {
    console.error(
      "Error: sigcomply binary not found on PATH.\n" +
        "Install the CLI or use pre-committed catalog files for development."
    );
    process.exit(1);
  }

  mkdirSync(catalogsDir, { recursive: true });

  const frameworks = frameworksFromConfig();
  // SPA only renders user-attestation entries. document_upload entries are
  // produced externally and uploaded directly to the bucket — filter them
  // out at build time so they never reach the browser.
  const SPA_RENDERABLE_TYPES = new Set(["declaration", "checklist"]);

  for (const fw of frameworks) {
    console.log(`Fetching catalog for ${fw}...`);
    try {
      const json = run(`sigcomply evidence catalog --framework ${fw} -o json`);
      const catalog = JSON.parse(json);
      const entries: Array<{ type: string }> = catalog.entries ?? [];
      const before = entries.length;
      catalog.entries = entries.filter((e) => SPA_RENDERABLE_TYPES.has(e.type));
      const after = catalog.entries.length;
      writeFileSync(
        join(catalogsDir, `${fw}.json`),
        JSON.stringify(catalog, null, 2) + "\n"
      );
      console.log(
        `  -> public/data/catalogs/${fw}.json (${after}/${before} entries, ${before - after} document_upload filtered)`
      );
    } catch {
      console.warn(`  ⚠ No manual catalog available for ${fw}, skipping.`);
    }
  }

  console.log("Done.");
}

main();
