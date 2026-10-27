// Verifies every signed evidence envelope under a directory (a downloaded
// vault, or one run folder) with the same code the /verify page runs:
// parseEnvelopeText, verifyEnvelopeSignature and the manual-record PDF hash
// match. Used by the E2E repos to check what a real CLI run wrote.
//
//   npm run verify-envelopes -- <dir> [--require-attachments]
//
// Exit 0 only when at least one envelope was found and every one verified.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnvelopeText } from "../src/lib/verification/parse-envelope.ts";
import {
  sha256Hex,
  verifyEnvelopeSignature,
} from "../src/lib/verification/verify.ts";
import { expectedPdfHashes } from "../src/lib/verification/manual.ts";
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
}

export function findJsonFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...findJsonFiles(p));
    else if (ent.isFile() && ent.name.endsWith(".json")) out.push(p);
  }
  return out.sort();
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

// Merged PDFs sit beside the envelopes: policies/<id>/attachments/
// <evidence_id>.pdf, or <evidence_id>.<member_id>.pdf for a fan-out member.
function attachmentPath(
  envelopePath: string,
  doc: ManualDocumentPayload,
  memberId?: string,
): string {
  const name = memberId
    ? `${doc.evidence_id}.${memberId}.pdf`
    : `${doc.evidence_id}.pdf`;
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
    const pdf = attachmentPath(envelopePath, doc, want.memberId);
    if (!existsSync(pdf)) {
      const msg = `no attachment for ${want.label}`;
      if (opts.requireAttachments) errors.push(msg);
      else notes.push(msg);
      continue;
    }
    const bytes = readFileSync(pdf);
    const got = await sha256Hex(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    );
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

export async function verifyDirectory(
  dir: string,
  opts: VerifyOptions = {},
): Promise<{ lines: string[]; ok: boolean; verified: number; failed: number }> {
  const lines: string[] = [];
  let verified = 0;
  let failed = 0;
  let skipped = 0;
  for (const file of findJsonFiles(dir)) {
    const v = await verifyEnvelopeFile(file, opts);
    const rel = relative(dir, file);
    if (v.status === "skip") {
      skipped++;
    } else if (v.status === "ok") {
      verified++;
      lines.push(`OK   ${rel}: ${v.detail}`);
    } else {
      failed++;
      lines.push(`FAIL ${rel}: ${v.detail}`);
    }
  }
  const total = verified + failed;
  lines.push(
    `${total} envelope(s): ${verified} verified, ${failed} failed; ${skipped} other JSON file(s) skipped`,
  );
  if (total === 0) lines.push(`FAIL no evidence envelopes found under ${dir}`);
  return { lines, ok: total > 0 && failed === 0, verified, failed };
}

function usage(): never {
  console.error("usage: verify-envelopes <dir> [--require-attachments]");
  process.exit(2);
}

export async function main(argv: string[]): Promise<number> {
  const args = argv.filter((a) => !a.startsWith("--"));
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  for (const f of flags) if (f !== "--require-attachments") usage();
  if (args.length !== 1) usage();
  // `npm run` changes into the package directory; resolve against the
  // caller's directory so `npm --prefix <spa> run verify-envelopes -- ./vault`
  // works.
  const dir = resolve(process.env.INIT_CWD ?? process.cwd(), args[0]);
  if (!existsSync(dir)) {
    console.error(`FAIL ${dir} does not exist`);
    return 1;
  }
  const { lines, ok } = await verifyDirectory(dir, {
    requireAttachments: flags.has("--require-attachments"),
  });
  for (const l of lines) console.log(l);
  return ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
