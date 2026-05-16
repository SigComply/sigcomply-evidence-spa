import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogsDir = join(__dirname, "..", "public", "data", "catalogs");

function run(cmd: string): string {
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

  const frameworks = ["soc2", "iso27001"];
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
