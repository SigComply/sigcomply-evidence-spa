// Verifies a downloaded vault (or one run folder) the way the CLI defines it
// (sigcomply-cli docs/architecture/05-vault-layout.md, "Verification"), with
// the same code the /verify page runs. Used by the E2E repos to check what a
// real CLI run wrote.
//
//   npm run verify-envelopes -- <dir> [--require-attachments] [--no-manifest]
//                                     [--public-key <base64>]
//
// For every run folder (a folder holding manifest.json):
//   - the manifest's Ed25519 signature over the canonical JSON of the
//     manifest minus `signature` (sign.VerifyManifest);
//   - its file_hashes against the files on disk: a listed file that is
//     missing, a file that is not listed, or a hash that differs fails.
// For every envelope (*.json under envelopes/, or any JSON shaped like one):
//   - its signature (parseEnvelopeText + verifyEnvelopeSignature);
//   - a manual record's merged-PDF hashes against attachments/;
//   - that a manifest covers it, unless --no-manifest.
// --public-key: every envelope and manifest must carry exactly this key.
// The CLI's built-in signer uses a fresh key per file, so this only fits a
// long-lived (HSM/KMS) signer. Without it, each manifest's key fingerprint
// (hex SHA-256 of the raw key, as /verify shows it) is printed.
//
// Symlinks fail and are not followed. Other JSON is listed as SKIP.
//
// What a pass proves: no file in a run changed, appeared or went missing
// since its manifest was signed, and every envelope is internally intact.
// It does not prove the CLI signed anything: the keys travel in the files,
// so anyone with write access can rewrite a run and re-sign it. Write-once
// storage is what stops that.
//
// Exit codes: 0 every check passed and at least one envelope was found;
// 1 any FAIL, or no envelope found; 2 bad arguments.
import {
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnvelopeText } from "../src/lib/verification/parse-envelope.ts";
import {
  canonicalJSON,
  parseJSONPreservingNumbers,
} from "../src/lib/verification/canonical.ts";
import {
  sha256Hex,
  verifyEnvelopeSignature,
  verifySignatureBlock,
  type SignatureBlock,
} from "../src/lib/verification/verify.ts";
import { expectedPdfHashes } from "../src/lib/verification/manual.ts";
import { ID_PATTERN } from "../src/lib/catalog-validate.ts";
import {
  getManualDocumentPayload,
  isEvidenceEnvelope,
  type ManualDocumentPayload,
} from "../src/types/envelope.ts";

export type FileVerdict =
  | { status: "ok"; path: string; detail: string }
  | { status: "fail"; path: string; detail: string }
  | { status: "skip"; path: string };

export interface VerifyOptions {
  /** Fail when the record names a PDF hash but no attachment is on disk. */
  requireAttachments?: boolean;
  /** Fail an envelope that no manifest.json covers. Default true. */
  requireManifest?: boolean;
  /** base64 raw Ed25519 key every envelope and manifest must carry. */
  publicKey?: string;
}

const MANIFEST = "manifest.json";
const MANIFEST_SCHEMA = "run.v1";

export interface TreeListing {
  /** Regular files, absolute paths, sorted. */
  files: string[];
  /** Symlinks (to files or folders), never followed. */
  symlinks: string[];
}

export function listTree(dir: string): TreeListing {
  const out: TreeListing = { files: [], symlinks: [] };
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isSymbolicLink()) out.symlinks.push(p);
    else if (ent.isDirectory()) {
      const sub = listTree(p);
      out.files.push(...sub.files);
      out.symlinks.push(...sub.symlinks);
    } else if (ent.isFile()) out.files.push(p);
  }
  out.files.sort();
  out.symlinks.sort();
  return out;
}

function bufferSha256(bytes: Buffer): Promise<string> {
  return sha256Hex(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
}

/**
 * Hex SHA-256 of a raw public key: the same value /verify shows as the key
 * fingerprint (sha256Hex over the decoded key).
 */
export function keyFingerprint(publicKeyB64: string): Promise<string> {
  return bufferSha256(Buffer.from(publicKeyB64, "base64"));
}

// Compares decoded bytes, so two spellings of the same key match.
function sameKey(a: string, b: string): boolean {
  return Buffer.from(a, "base64").equals(Buffer.from(b, "base64"));
}

async function keyMismatch(got: string, want: string): Promise<string> {
  return `signed by key ${await keyFingerprint(got)}, expected ${await keyFingerprint(want)}`;
}

// The CLI writes envelopes to policies/<id>/envelopes/*.json. A file there
// that fails to parse is a broken envelope, not "some other JSON".
function inEnvelopesDir(path: string): boolean {
  return dirname(path).split(sep).pop() === "envelopes";
}

function looksLikeEnvelope(text: string): boolean {
  try {
    return isEvidenceEnvelope(JSON.parse(text));
  } catch {
    return false;
  }
}

function fileSha256(path: string): Promise<string> {
  return bufferSha256(readFileSync(path));
}

// IDs must be one file-name segment (ID_PATTERN: no separator, no leading
// dot). They come from a payload whose key is self-asserted, so they must not
// steer the path.

// Merged PDFs sit beside the envelopes: policies/<id>/attachments/
// <evidence_id>.pdf, or <evidence_id>.<member_id>.pdf for a fan-out member.
function attachmentPath(
  envelopePath: string,
  doc: ManualDocumentPayload,
  memberId?: string,
): string {
  const id = doc.evidence_id ?? "";
  if (!ID_PATTERN.test(id)) throw new Error(`unsafe evidence_id ${JSON.stringify(id)}`);
  if (memberId !== undefined && !ID_PATTERN.test(memberId)) {
    throw new Error(`unsafe member id ${JSON.stringify(memberId)}`);
  }
  const name = memberId ? `${id}.${memberId}.pdf` : `${id}.pdf`;
  return join(dirname(envelopePath), "..", "attachments", name);
}

async function checkAttachments(
  envelopePath: string,
  doc: ManualDocumentPayload,
  opts: VerifyOptions,
): Promise<{ notes: string[]; errors: string[] }> {
  const notes: string[] = [];
  const errors: string[] = [];
  for (const want of expectedPdfHashes(doc)) {
    let pdf: string;
    try {
      pdf = attachmentPath(envelopePath, doc, want.memberId);
    } catch (err) {
      errors.push((err as Error).message);
      continue;
    }
    if (!existsSync(pdf)) {
      const msg = `no attachment for ${want.label}`;
      if (opts.requireAttachments) errors.push(msg);
      else notes.push(msg);
      continue;
    }
    const got = await fileSha256(pdf);
    if (got === want.hash) notes.push(`pdf match ${want.label}`);
    else errors.push(`pdf hash mismatch for ${want.label}: got ${got}, signed ${want.hash}`);
  }
  return { notes, errors };
}

export async function verifyEnvelopeFile(
  path: string,
  opts: VerifyOptions = {},
): Promise<FileVerdict> {
  const text = readFileSync(path, "utf-8");
  if (!inEnvelopesDir(path) && !looksLikeEnvelope(text)) {
    return { status: "skip", path };
  }
  const parsed = parseEnvelopeText(text);
  if (parsed.kind !== "ok") {
    const detail = parsed.kind === "empty" ? "empty file" : parsed.message;
    return { status: "fail", path, detail };
  }
  const sig = parsed.envelope.signature;
  if (opts.publicKey && !sameKey(sig.public_key, opts.publicKey)) {
    return { status: "fail", path, detail: await keyMismatch(sig.public_key, opts.publicKey) };
  }
  let result;
  try {
    result = await verifyEnvelopeSignature(parsed.envelope, parsed.sourceText);
  } catch (err) {
    return { status: "fail", path, detail: (err as Error).message };
  }
  if (!result.valid) {
    return { status: "fail", path, detail: result.reason ?? "signature invalid" };
  }
  const n = parsed.envelope.records.length;
  const notes = [`signature valid, ${n} ${n === 1 ? "record" : "records"}`];
  const doc = getManualDocumentPayload(parsed.envelope);
  if (doc) {
    const att = await checkAttachments(path, doc, opts);
    if (att.errors.length > 0) {
      return { status: "fail", path, detail: att.errors.join("; ") };
    }
    notes.push(...att.notes);
  }
  return { status: "ok", path, detail: notes.join(", ") };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// A file_hashes key is a path relative to the run folder, "/"-separated.
function safeRelPath(p: string): boolean {
  if (p === "" || p.startsWith("/") || p.includes("\\")) return false;
  return p.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

/**
 * Verifies <runDir>/manifest.json: its signature, then its file_hashes
 * against every other regular file under runDir. `runFiles` are the
 * regular files under runDir (absolute paths).
 */
export async function verifyManifest(
  runDir: string,
  runFiles: string[],
  opts: VerifyOptions = {},
): Promise<FileVerdict> {
  const path = join(runDir, MANIFEST);
  const fail = (detail: string): FileVerdict => ({ status: "fail", path, detail });

  let raw: unknown;
  try {
    // Numbers keep their source text so the canonical bytes match the
    // CLI's (a manifest has no numbers today; this keeps it exact anyway).
    raw = parseJSONPreservingNumbers(readFileSync(path, "utf-8"));
  } catch (err) {
    return fail(`Invalid JSON: ${(err as Error).message}`);
  }
  if (!isObject(raw)) return fail("expected a JSON object");
  if (raw.schema_version !== MANIFEST_SCHEMA) {
    return fail(`unsupported schema_version ${JSON.stringify(raw.schema_version)}, expected "${MANIFEST_SCHEMA}"`);
  }
  const hashes = raw.file_hashes;
  if (!isObject(hashes)) return fail("file_hashes: expected an object");
  for (const [rel, h] of Object.entries(hashes)) {
    if (!safeRelPath(rel)) return fail(`file_hashes: unsafe path ${JSON.stringify(rel)}`);
    if (typeof h !== "string") return fail(`file_hashes[${JSON.stringify(rel)}]: expected a string`);
  }
  const sig = raw.signature;
  if (
    !isObject(sig) ||
    typeof sig.algorithm !== "string" ||
    typeof sig.public_key !== "string" ||
    typeof sig.value !== "string"
  ) {
    return fail("signature: expected an object with algorithm, public_key and value strings");
  }
  const block = sig as unknown as SignatureBlock;
  if (opts.publicKey && !sameKey(block.public_key, opts.publicKey)) {
    return fail(await keyMismatch(block.public_key, opts.publicKey));
  }

  // The signed object is the manifest minus `signature` (sign.VerifyManifest).
  const signedFields = Object.fromEntries(
    Object.entries(raw).filter(([k]) => k !== "signature"),
  );
  let result;
  try {
    result = await verifySignatureBlock(block, canonicalJSON(signedFields));
  } catch (err) {
    return fail((err as Error).message);
  }
  if (!result.valid) return fail(result.reason ?? "signature invalid");

  const onDisk = new Map<string, string>();
  for (const f of runFiles) {
    const rel = relative(runDir, f).split(sep).join("/");
    if (rel !== MANIFEST) onDisk.set(rel, f);
  }
  const problems: string[] = [];
  for (const rel of Object.keys(hashes).sort()) {
    const file = onDisk.get(rel);
    if (!file) {
      problems.push(`missing on disk: ${rel}`);
      continue;
    }
    const got = `sha256:${await fileSha256(file)}`;
    if (got !== hashes[rel]) problems.push(`hash mismatch: ${rel}`);
  }
  for (const rel of [...onDisk.keys()].sort()) {
    if (!Object.hasOwn(hashes, rel)) problems.push(`not in file_hashes: ${rel}`);
  }
  if (problems.length > 0) return fail(problems.join("; "));

  const n = Object.keys(hashes).length;
  return {
    status: "ok",
    path,
    detail: `signature valid (key ${await keyFingerprint(block.public_key)}), ${n} files match file_hashes`,
  };
}

// The nearest folder at or above `file`'s folder (inside root) that is a
// run folder.
function runDirOf(file: string, runDirs: Set<string>, root: string): string | undefined {
  let d = dirname(file);
  for (;;) {
    if (runDirs.has(d)) return d;
    if (d === root) return undefined;
    const up = dirname(d);
    if (up === d) return undefined;
    d = up;
  }
}

export async function verifyDirectory(
  dir: string,
  opts: VerifyOptions = {},
): Promise<{ lines: string[]; ok: boolean; verified: number; failed: number }> {
  const requireManifest = opts.requireManifest ?? true;
  const lines: string[] = [];
  const failLine = (path: string, detail: string) => {
    failed++;
    lines.push(`FAIL ${relative(dir, path)}: ${detail}`);
  };
  let verified = 0;
  let failed = 0;
  let envelopes = 0;
  let skipped = 0;
  let manifestsOk = 0;
  let manifestsFailed = 0;

  if (opts.publicKey) lines.push(`pinned public key ${await keyFingerprint(opts.publicKey)}`);

  const { files, symlinks } = listTree(dir);
  for (const s of symlinks) failLine(s, "symlink, not followed");

  const manifests = files.filter((f) => f.split(sep).pop() === MANIFEST);
  const manifestSet = new Set(manifests);
  const runDirs = new Set(manifests.map((m) => dirname(m)));
  for (const m of manifests) {
    const runDir = dirname(m);
    const prefix = runDir + sep;
    const v = await verifyManifest(runDir, files.filter((f) => f.startsWith(prefix)), opts);
    if (v.status === "ok") {
      manifestsOk++;
      lines.push(`OK   ${relative(dir, m)}: ${v.detail}`);
    } else if (v.status === "fail") {
      manifestsFailed++;
      failLine(m, v.detail);
    }
  }

  for (const file of files) {
    if (!file.endsWith(".json") || manifestSet.has(file)) continue;
    const rel = relative(dir, file);
    const v = await verifyEnvelopeFile(file, opts);
    if (v.status === "skip") {
      skipped++;
      lines.push(`SKIP ${rel}: not an evidence envelope`);
      continue;
    }
    envelopes++;
    if (v.status === "fail") {
      failLine(file, v.detail);
    } else if (requireManifest && !runDirOf(file, runDirs, dir)) {
      failLine(file, `${v.detail}, but no ${MANIFEST} covers it`);
    } else {
      verified++;
      lines.push(`OK   ${rel}: ${v.detail}`);
    }
  }

  lines.push(
    `${manifestsOk + manifestsFailed} manifest(s): ${manifestsOk} verified, ${manifestsFailed} failed; ` +
      `${envelopes} envelope(s): ${verified} verified, ${envelopes - verified} failed; ` +
      `${skipped} other JSON file(s) skipped`,
  );
  if (envelopes === 0) lines.push(`FAIL no evidence envelopes found under ${dir}`);
  return { lines, ok: envelopes > 0 && failed === 0, verified, failed };
}

const USAGE =
  "usage: verify-envelopes <dir> [--require-attachments] [--no-manifest] [--public-key <base64>]";

function parseArgs(
  argv: string[],
): { ok: true; dir: string; opts: VerifyOptions } | { ok: false; error: string } {
  const opts: VerifyOptions = {};
  const dirs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--require-attachments") opts.requireAttachments = true;
    else if (a === "--no-manifest") opts.requireManifest = false;
    else if (a === "--public-key") {
      const v = argv[++i];
      if (v === undefined) return { ok: false, error: "--public-key needs a value" };
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(v) || Buffer.from(v, "base64").length !== 32) {
        return { ok: false, error: "--public-key must be the base64 of a raw 32-byte Ed25519 key" };
      }
      opts.publicKey = v;
    } else if (a.startsWith("--")) return { ok: false, error: `unknown flag ${a}` };
    else dirs.push(a);
  }
  if (dirs.length !== 1) return { ok: false, error: "expected exactly one directory" };
  return { ok: true, dir: dirs[0], opts };
}

export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    console.error(`verify-envelopes: ${parsed.error}`);
    console.error(USAGE);
    return 2;
  }
  // `npm run` changes into the package directory; resolve against the
  // caller's directory so `npm --prefix <spa> run verify-envelopes -- ./vault`
  // works.
  const dir = resolve(process.env.INIT_CWD ?? process.cwd(), parsed.dir);
  if (!existsSync(dir)) {
    console.error(`FAIL ${dir} does not exist`);
    return 1;
  }
  const { lines, ok } = await verifyDirectory(dir, parsed.opts);
  for (const l of lines) console.log(l);
  return ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
