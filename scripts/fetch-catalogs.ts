import { execSync } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "src", "data");
const catalogsDir = join(dataDir, "catalogs");

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

  for (const fw of frameworks) {
    console.log(`Fetching catalog for ${fw}...`);
    try {
      const json = run(`sigcomply evidence catalog --framework ${fw} -o json`);
      JSON.parse(json); // validate
      writeFileSync(join(catalogsDir, `${fw}.json`), json + "\n");
      console.log(`  -> src/data/catalogs/${fw}.json`);
    } catch {
      console.warn(`  ⚠ No manual catalog available for ${fw}, skipping.`);
    }
  }

  console.log("Fetching schema...");
  const schema = run("sigcomply evidence schema");
  JSON.parse(schema); // validate
  writeFileSync(join(dataDir, "schema.json"), schema + "\n");
  console.log("  -> src/data/schema.json");

  console.log("Done.");
}

main();
