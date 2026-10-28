import type {
  ManualDocumentPayload,
  ManualInstancePayload,
} from "@/types/envelope";

/** A PDF hash the signed manual record vouches for. */
export interface ExpectedPdfHash {
  /** Bare lowercase hex, as `sha256Hex` returns it. */
  hash: string;
  /** What the hash belongs to, for the UI. */
  label: string;
  /** Set when the hash is a fan-out member's. */
  memberId?: string;
}

/**
 * The CLI's recorded verdict for one fan-out member. `/verify` only reads
 * it; it cannot re-check presence or the temporal window itself.
 */
export type MemberVerdict = "satisfied" | "exempt" | "missing" | "failed";

export function memberVerdict(m: ManualInstancePayload): MemberVerdict {
  if (!m.required) return "exempt";
  if (m.satisfied) return "satisfied";
  if (!m.file_present) return "missing";
  return "failed";
}

/** One verdict field of a single-folder record, as the CLI signed it. */
export interface RecordedCheck {
  label: string;
  /** undefined when the CLI didn't check it, or the record lacks the field. */
  ok: boolean | undefined;
}

/**
 * The verdict fields a single-folder manual record carries, in the order the
 * CLI checks them. `/verify` shows them; it never re-derives them. The CLI
 * signs `false` for a check it never ran: with no file it checks nothing,
 * and when no file could become a PDF (only unsupported types, or every
 * conversion failed) it has no `file_hash` and never judges the upload
 * window. Those read as "not checked", not "no".
 */
export function recordedChecks(p: ManualDocumentPayload): RecordedCheck[] {
  const present = p.file_present;
  const merged = present === true && Boolean(p.file_hash);
  return [
    { label: "File in the folder", ok: present },
    {
      label: "Uploaded within the period or its grace window",
      ok: merged ? p.in_temporal_window : undefined,
    },
    {
      // file_valid is also false for a byte-identical copy of the prior
      // period, an unsupported type or a failed conversion, not only for a
      // broken PDF; the failures listed below say which.
      label: "Passed the CLI's file checks",
      ok: present === true ? p.file_valid : undefined,
    },
  ];
}

// The CLI writes "sha256:<hex>"; sha256Hex returns bare hex.
function bareHex(h: string): string {
  return h.replace(/^sha256:/i, "").toLowerCase();
}

export function memberLabel(m: ManualInstancePayload): string {
  return m.name ? `${m.name} (${m.id})` : m.id;
}

/**
 * Every PDF hash the record carries: the top-level `file_hash` of a
 * single-folder entry, or one per fan-out member that had files. A fan-out
 * record has no top-level hash, so without the member hashes a dropped PDF
 * could never be checked.
 */
export function expectedPdfHashes(
  p: ManualDocumentPayload,
): ExpectedPdfHash[] {
  const out: ExpectedPdfHash[] = [];
  if (p.file_hash) {
    out.push({ hash: bareHex(p.file_hash), label: p.evidence_id ?? "evidence" });
  }
  for (const m of p.instances ?? []) {
    if (!m.file_hash) continue;
    out.push({ hash: bareHex(m.file_hash), label: memberLabel(m), memberId: m.id });
  }
  return out;
}

/** The expected hash a computed PDF hash matches, or null. */
export function matchPdfHash(
  p: ManualDocumentPayload,
  hex: string,
): ExpectedPdfHash | null {
  const want = hex.toLowerCase();
  return expectedPdfHashes(p).find((e) => e.hash === want) ?? null;
}
