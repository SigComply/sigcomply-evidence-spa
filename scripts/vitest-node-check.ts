import { readFileSync } from "node:fs";
import { join } from "node:path";

// Vitest globalSetup. On an older Node (23 was the one seen) some component
// tests fail with misleading "element not found" errors instead of a version
// error, and nothing else stops `npm run test`: engine-strict in .npmrc only
// guards `npm ci`. Fail first, with the reason. It exits instead of throwing:
// on Node 23 Vitest's own error printer crashes and hides a thrown message.
export default function checkNodeVersion(): void {
  const want = Number(
    readFileSync(join(import.meta.dirname, "..", ".nvmrc"), "utf-8").trim(),
  );
  const have = Number(process.versions.node.split(".")[0]);
  if (have < want) {
    process.stderr.write(
      `\nNode >=${want} required (see .nvmrc); this is Node ${process.versions.node}.\n`,
    );
    process.exit(1);
  }
}
