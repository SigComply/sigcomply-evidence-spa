import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The major version an .nvmrc names ("24", "v24", "24.1", "v24.22.1"). An
 * alias such as "lts/*" names no number to compare, so it throws rather
 * than let the check pass by comparing against NaN.
 */
export function majorFromNvmrc(text: string): number {
  const m = /^v?(\d+)(?:\.|$)/.exec(text.trim());
  if (!m) {
    throw new Error(
      `.nvmrc must start with a Node major version (e.g. 24), got ${JSON.stringify(text.trim())}`,
    );
  }
  return Number(m[1]);
}

// Vitest globalSetup. On an older Node (23 was the one seen) some component
// tests fail with misleading "element not found" errors instead of a version
// error, and nothing else stops `npm run test`: engine-strict in .npmrc only
// guards `npm ci`. Fail first, with the reason. It exits instead of throwing:
// on Node 23 Vitest's own error printer crashes and hides a thrown message.
export default function checkNodeVersion(): void {
  const fail = (message: string): never => {
    process.stderr.write(`\n${message}\n`);
    process.exit(1);
  };
  let want = 0;
  try {
    want = majorFromNvmrc(
      readFileSync(join(import.meta.dirname, "..", ".nvmrc"), "utf-8"),
    );
  } catch (err) {
    fail((err as Error).message);
  }
  const have = Number(process.versions.node.split(".")[0]);
  if (have < want) {
    fail(`Node >=${want} required (see .nvmrc); this is Node ${process.versions.node}.`);
  }
}
