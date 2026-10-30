import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CheckCircle2,
  FileJson,
  FileWarning,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import {
  getManualDocumentPayload,
  type EvidenceEnvelope,
  type ManualDocumentPayload,
  type ManualInstancePayload,
} from "@/types/envelope";
import {
  sha256Hex,
  verifyEnvelopeSignature,
  WebCryptoUnsupportedError,
  type VerifyResult,
} from "@/lib/verification/verify";
import {
  expectedPdfHashes,
  matchPdfHash,
  memberLabel,
  memberVerdict,
  recordedChecks,
  type ExpectedPdfHash,
  type MemberVerdict,
} from "@/lib/verification/manual";
import { parseEnvelopeText } from "@/lib/verification/parse-envelope";

export type SigStatus =
  | { state: "idle" }
  | { state: "verifying" }
  | { state: "valid"; result: VerifyResult }
  | { state: "invalid"; result: VerifyResult }
  | { state: "error"; message: string };

type PdfStatus =
  | { state: "idle" }
  | { state: "hashing"; filename: string }
  | { state: "match"; filename: string; hash: string; matched: ExpectedPdfHash }
  | {
      state: "mismatch";
      filename: string;
      hash: string;
      expected: ExpectedPdfHash[];
    }
  | { state: "error"; message: string };

function truncate(s: string, n = 20): string {
  if (s.length <= n * 2 + 3) return s;
  return `${s.slice(0, n)}…${s.slice(-n)}`;
}

function previewPayload(p: unknown): string {
  try {
    return JSON.stringify(p, null, 2);
  } catch {
    return String(p);
  }
}

// LazyDetails renders its body only while open: a large envelope's records
// pretty-printed into the DOM took gigabytes of memory even when collapsed.
function LazyDetails({
  summary,
  children,
}: {
  summary: string;
  children: () => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        {summary}
      </summary>
      {open && children()}
    </details>
  );
}

export function Verify() {
  const [rawJson, setRawJson] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [envelope, setEnvelope] = useState<EvidenceEnvelope | null>(null);
  // The original, un-reformatted envelope text — used to derive canonical
  // bytes from a lexeme-preserving parse (so large integers aren't rounded).
  // Kept separate from `rawJson`, which may be pretty-printed for display.
  const [sourceText, setSourceText] = useState("");
  const [sigStatus, setSigStatus] = useState<SigStatus>({ state: "idle" });
  const [pdfStatus, setPdfStatus] = useState<PdfStatus>({ state: "idle" });
  const [envDragActive, setEnvDragActive] = useState(false);
  const [pdfDragActive, setPdfDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const manualDoc: ManualDocumentPayload | null = useMemo(
    () => (envelope ? getManualDocumentPayload(envelope) : null),
    [envelope],
  );

  const pdfHashes: ExpectedPdfHash[] = useMemo(
    () => (manualDoc ? expectedPdfHashes(manualDoc) : []),
    [manualDoc],
  );
  const members = manualDoc?.instances;

  // Summary stats for the loaded envelope: how many records and which
  // distinct record types are present.
  const recordSummary = useMemo(() => {
    if (!envelope) return null;
    const types = new Set<string>();
    for (const r of envelope.records) types.add(r.type);
    return {
      count: envelope.records.length,
      types: Array.from(types).sort(),
    };
  }, [envelope]);

  // `reformat` is true for paste / file load — once the text parses we
  // pretty-print it so a minified envelope is readable. It stays false
  // for keystrokes (reformatting mid-type would jump the caret).
  const handleParse = useCallback(
    (text: string, opts?: { reformat?: boolean }) => {
      setPdfStatus({ state: "idle" });

      const result = parseEnvelopeText(text);
      if (result.kind === "empty") {
        setRawJson(text);
        setEnvelope(null);
        setParseError(null);
        setSigStatus({ state: "idle" });
        return;
      }

      // Once the text parses, prettify the visible copy. That helps the
      // "valid JSON, wrong shape" case where the box stays on screen.
      setRawJson(opts?.reformat && result.pretty ? result.pretty : text);

      if (result.kind === "invalid") {
        setEnvelope(null);
        setParseError(result.message);
        setSigStatus({ state: "idle" });
        return;
      }

      setEnvelope(result.envelope);
      // Preserve the original text (not the pretty-printed copy) so the
      // signature check canonicalises from a lexeme-preserving parse.
      setSourceText(result.sourceText);
      setParseError(null);
      // Verdict-first: flip to "verifying" the instant a valid envelope is
      // parsed. The effect below runs the async check and resolves it —
      // keeping setState out of the effect body itself.
      setSigStatus({ state: "verifying" });
    },
    [],
  );

  const handleEnvelopeFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        handleParse(text, { reformat: true });
      } catch (err) {
        setParseError(`Could not read file: ${(err as Error).message}`);
      }
    },
    [handleParse],
  );

  // Compute the post-paste value (honouring any selection) and route it
  // through handleParse with reformat on, so a pasted minified envelope
  // lands pretty-printed.
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pasted = e.clipboardData.getData("text");
      if (!pasted) return;
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart ?? rawJson.length;
      const end = el.selectionEnd ?? rawJson.length;
      const next = rawJson.slice(0, start) + pasted + rawJson.slice(end);
      handleParse(next, { reformat: true });
    },
    [rawJson, handleParse],
  );

  // Verdict-first: the moment a valid envelope is loaded, run the
  // signature check automatically. The auditor wants the verdict, not
  // a "click to verify" step.
  useEffect(() => {
    if (!envelope) return;
    let cancelled = false;
    verifyEnvelopeSignature(envelope, sourceText)
      .then((result) => {
        if (cancelled) return;
        setSigStatus({
          state: result.valid ? "valid" : "invalid",
          result,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        const message =
          err instanceof WebCryptoUnsupportedError
            ? err.message
            : (err as Error).message;
        setSigStatus({ state: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [envelope, sourceText]);

  const handlePdfFile = useCallback(
    async (file: File) => {
      if (!manualDoc || pdfHashes.length === 0) return;
      // Guard against an obviously-wrong file so a hash mismatch doesn't read
      // as "the evidence was tampered with" when the user simply dropped the
      // wrong file. The manifest hashes the merged evidence.pdf.
      const looksPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
      if (!looksPdf) {
        setPdfStatus({
          state: "error",
          message: `“${file.name}” doesn't look like a PDF. Drop the evidence.pdf that was signed alongside this envelope.`,
        });
        return;
      }
      setPdfStatus({ state: "hashing", filename: file.name });
      try {
        const buf = await file.arrayBuffer();
        const hash = await sha256Hex(buf);
        // A fan-out record carries one hash per member, so the dropped PDF
        // may belong to any of them; report which one it matched.
        const matched = matchPdfHash(manualDoc, hash);
        if (matched) {
          setPdfStatus({ state: "match", filename: file.name, hash, matched });
        } else {
          setPdfStatus({
            state: "mismatch",
            filename: file.name,
            hash,
            expected: pdfHashes,
          });
        }
      } catch (err) {
        setPdfStatus({ state: "error", message: (err as Error).message });
      }
    },
    [manualDoc, pdfHashes],
  );

  const onEnvelopeDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setEnvDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleEnvelopeFile(file);
    },
    [handleEnvelopeFile],
  );

  const onPdfDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setPdfDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handlePdfFile(file);
    },
    [handlePdfFile],
  );

  const reset = useCallback(() => {
    setRawJson("");
    setSourceText("");
    setParseError(null);
    setEnvelope(null);
    setSigStatus({ state: "idle" });
    setPdfStatus({ state: "idle" });
  }, []);

  // Identity badges drawn from the manual payload when present, else
  // a generic "automated" tag derived from the record set.
  const identityParts = useMemo(() => {
    const parts: string[] = [];
    if (manualDoc?.evidence_id) parts.push(manualDoc.evidence_id);
    parts.push(manualDoc ? "manual" : "automated");
    if (manualDoc?.period_id) parts.push(manualDoc.period_id);
    return parts;
  }, [manualDoc]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Verify signed evidence
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          For auditors. Drop a CLI-signed{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            EvidenceEnvelope
          </code>{" "}
          to re-check its Ed25519 signature against the public key inside it;
          optionally add the matching PDF to re-hash and confirm it. Nothing is
          uploaded — verification runs entirely in your browser.
        </p>
      </div>

      {/* Input — prominent until an envelope is loaded, then a thin bar. */}
      {!envelope ? (
        <div className="space-y-3">
          <div
            role="region"
            aria-label="Drop the signed envelope JSON file here"
            onDrop={onEnvelopeDrop}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={() => setEnvDragActive(true)}
            onDragLeave={() => setEnvDragActive(false)}
            className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground transition-colors ${
              envDragActive
                ? "border-primary bg-primary/5"
                : "border-input bg-muted/20 hover:bg-muted/40"
            }`}
          >
            <FileJson className="h-7 w-7 text-muted-foreground/70" />
            <div>
              <span className="font-medium text-foreground">
                Drop the signed envelope JSON
              </span>
              <span className="block text-xs">
                from the run folder in the vault, e.g.{" "}
                <code className="font-mono break-all">
                  policies/&lt;policy_id&gt;/envelopes/directory_user__aws.iam.json
                </code>
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Choose envelope file
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleEnvelopeFile(f);
                e.target.value = "";
              }}
            />
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              …or paste JSON
            </summary>
            <div className="mt-2">
              <Label
                htmlFor="envelope-json"
                className="sr-only"
              >
                Envelope JSON
              </Label>
              <Textarea
                id="envelope-json"
                value={rawJson}
                onChange={(e) => handleParse(e.target.value)}
                onPaste={handlePaste}
                placeholder='{ "format_version": "envelope.v1", "produced_at": "...", "records": [ ... ], "signature": { "algorithm": "ed25519", "public_key": "...", "value": "..." } }'
                className="mt-1 h-56 resize-y font-mono text-xs leading-relaxed"
                spellCheck={false}
              />
            </div>
          </details>

          {parseError && (
            <Alert variant="destructive">
              <FileWarning className="h-4 w-4" />
              <AlertTitle>Could not parse envelope</AlertTitle>
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <span className="flex items-center gap-2 truncate text-muted-foreground">
            <FileJson className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {manualDoc?.evidence_id ?? "Envelope loaded"}
            </span>
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Verify another
          </Button>
        </div>
      )}

      {/* Verdict */}
      {envelope && (
        <div className="overflow-hidden rounded-xl border">
          <VerdictBanner status={sigStatus} />

          <div className="space-y-5 p-5">
            {/* Identity */}
            <div className="flex flex-wrap items-center gap-1.5">
              {identityParts.map((p, i) => (
                <Badge
                  key={`${p}-${i}`}
                  variant={
                    p === "manual"
                      ? "default"
                      : p === "automated"
                        ? "secondary"
                        : "outline"
                  }
                  className="font-mono text-xs"
                >
                  {p}
                </Badge>
              ))}
            </div>

            {/* Record summary — count + distinct types */}
            {recordSummary && (
              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-sm font-medium">
                  {recordSummary.count}{" "}
                  {recordSummary.count === 1 ? "record" : "records"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Types:{" "}
                  {recordSummary.types.length === 0 ? (
                    <span className="italic">none</span>
                  ) : (
                    recordSummary.types.map((t, i) => (
                      <span key={t}>
                        <code className="font-mono">{t}</code>
                        {i < recordSummary.types.length - 1 ? ", " : ""}
                      </span>
                    ))
                  )}
                </p>
              </div>
            )}

            {/* The CLI's signed verdicts and the PDF check mean something
                only once the signature checks out. */}
            {manualDoc && sigStatus.state !== "valid" && (
              <div className="rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground">
                <p className="text-sm font-medium text-foreground">
                  Recorded results and PDF check
                </p>
                {sigStatus.state === "invalid" || sigStatus.state === "error"
                  ? "Hidden: the signature isn't valid, so nothing vouches for the results or hashes in this file."
                  : "Shown once the signature is verified."}
              </div>
            )}

            {/* Fan-out members — the CLI's signed per-member verdicts */}
            {sigStatus.state === "valid" && members && members.length > 0 && (
              <MembersPanel
                members={members}
                total={manualDoc?.instances_total ?? members.length}
                satisfied={manualDoc?.instances_satisfied ?? 0}
                matchedId={
                  pdfStatus.state === "match"
                    ? pdfStatus.matched.memberId
                    : undefined
                }
              />
            )}

            {/* Single-folder record — the CLI's signed verdict fields */}
            {sigStatus.state === "valid" &&
              manualDoc &&
              !(members && members.length > 0) && (
                <RecordedPanel record={manualDoc} />
              )}

            {/* PDF hash check: only against hashes a valid signature vouches for */}
            {pdfHashes.length > 0 && sigStatus.state === "valid" && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Evidence PDF</p>
                    <p className="text-xs text-muted-foreground">
                      {members ? (
                        <>
                          Hash a member&apos;s PDF and compare it to the{" "}
                          <code className="font-mono">file_hash</code> the
                          record holds for each member.
                        </>
                      ) : (
                        <>
                          Hash the matching PDF and compare it to the
                          record&apos;s{" "}
                          <code className="font-mono">file_hash</code>.
                        </>
                      )}{" "}
                      The hash is of the merged PDF the CLI stores in the run
                      folder under <code className="font-mono">attachments/</code>;
                      a single uploaded PDF also matches.
                    </p>
                  </div>
                  {pdfStatus.state === "match" && (
                    <Badge className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      match
                    </Badge>
                  )}
                  {pdfStatus.state === "mismatch" && (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      mismatch
                    </Badge>
                  )}
                </div>

                {pdfStatus.state !== "match" &&
                  pdfStatus.state !== "mismatch" && (
                    <div
                      role="region"
                      aria-label="Drop the matching evidence PDF here"
                      onDrop={onPdfDrop}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnter={() => setPdfDragActive(true)}
                      onDragLeave={() => setPdfDragActive(false)}
                      className={`flex items-center justify-center gap-3 rounded-md border border-dashed p-4 text-xs text-muted-foreground transition-colors ${
                        pdfDragActive
                          ? "border-primary bg-primary/5"
                          : "border-input hover:bg-muted/40"
                      }`}
                    >
                      {pdfStatus.state === "hashing" ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Hashing {pdfStatus.filename}…
                        </span>
                      ) : (
                        <>
                          <span>Drop the PDF here, or</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => pdfInputRef.current?.click()}
                          >
                            <Upload className="mr-2 h-4 w-4" />
                            Choose PDF
                          </Button>
                        </>
                      )}
                      <input
                        ref={pdfInputRef}
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handlePdfFile(f);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  )}

                {pdfStatus.state === "match" && (
                  <p className="break-all text-xs text-muted-foreground">
                    <span className="font-mono">{pdfStatus.filename}</span>{" "}
                    matches{" "}
                    <span className="font-medium text-foreground">
                      {pdfStatus.matched.label}
                    </span>{" "}
                    · SHA-256{" "}
                    <span className="font-mono">{pdfStatus.hash}</span>
                  </p>
                )}
                {pdfStatus.state === "mismatch" && (
                  <div className="space-y-1 break-all text-xs">
                    <p>
                      <span className="text-muted-foreground">Got: </span>
                      <span className="font-mono">{pdfStatus.hash}</span>
                    </p>
                    <p className="text-muted-foreground">
                      {pdfStatus.expected.length === 1
                        ? "Expected:"
                        : "Expected one of:"}
                    </p>
                    {pdfStatus.expected.map((e) => (
                      <p key={`${e.label}-${e.hash}`}>
                        {pdfStatus.expected.length > 1 && (
                          <span className="text-muted-foreground">
                            {e.label}:{" "}
                          </span>
                        )}
                        <span className="font-mono">{e.hash}</span>
                      </p>
                    ))}
                  </div>
                )}
                {pdfStatus.state === "error" && (
                  <Alert variant="destructive">
                    <FileWarning className="h-4 w-4" />
                    <AlertTitle>Could not hash file</AlertTitle>
                    <AlertDescription>{pdfStatus.message}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Details — plumbing behind disclosure */}
            <div className="space-y-2 border-t pt-4 text-sm">
              <LazyDetails summary="Envelope details">
                {() => (
                <>
                <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                  <span className="text-muted-foreground">Format</span>
                  <span className="font-mono">{envelope.format_version}</span>

                  <span className="text-muted-foreground">Produced at</span>
                  <span className="font-mono">{envelope.produced_at}</span>

                  <span className="text-muted-foreground">Algorithm</span>
                  <span className="font-mono">
                    {envelope.signature.algorithm}
                  </span>

                  <span className="text-muted-foreground">Public key</span>
                  <span className="font-mono break-all">
                    {truncate(envelope.signature.public_key, 24)}
                  </span>

                  <span className="text-muted-foreground">Signature</span>
                  <span className="font-mono break-all">
                    {truncate(envelope.signature.value, 24)}
                  </span>

                  {manualDoc && (
                    <>
                      {manualDoc.expected_uri && (
                        <>
                          <span className="text-muted-foreground">
                            Folder URI
                          </span>
                          <span className="font-mono break-all">
                            {manualDoc.expected_uri}
                          </span>
                        </>
                      )}
                      {manualDoc.file_hash && (
                        <>
                          <span className="text-muted-foreground">
                            Expected SHA-256
                          </span>
                          <span className="font-mono break-all">
                            {manualDoc.file_hash}
                          </span>
                        </>
                      )}
                    </>
                  )}
                </div>
                <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs">
                  {previewPayload(envelope.records)}
                </pre>
                </>
                )}
              </LazyDetails>

              {(sigStatus.state === "valid" ||
                sigStatus.state === "invalid") && (
                <LazyDetails summary="Canonical bytes verified">
                  {() => (
                    <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-3 font-mono text-xs">
                      {sigStatus.result.signedBytes}
                    </pre>
                  )}
                </LazyDetails>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const VERDICT_BADGE: Record<
  MemberVerdict,
  { text: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  satisfied: { text: "satisfied", variant: "default" },
  exempt: { text: "exempt", variant: "secondary" },
  missing: { text: "no evidence", variant: "destructive" },
  failed: { text: "failed", variant: "destructive" },
};

const CHECK_BADGE = {
  yes: { text: "yes", variant: "default" },
  no: { text: "no", variant: "destructive" },
  unknown: { text: "not checked", variant: "outline" },
} as const;

function RecordedPanel({ record }: { record: ManualDocumentPayload }) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div>
        <p className="text-sm font-medium">What the CLI recorded</p>
        <p className="text-xs text-muted-foreground">
          These results are what the CLI recorded and signed for the folder;
          this page checks the signature, not the folder.
        </p>
      </div>
      <ul className="divide-y rounded-md border bg-background">
        {recordedChecks(record).map((c) => {
          const b = CHECK_BADGE[c.ok === undefined ? "unknown" : c.ok ? "yes" : "no"];
          return (
            <li
              key={c.label}
              className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
            >
              <span>{c.label}</span>
              <Badge variant={b.variant}>{b.text}</Badge>
            </li>
          );
        })}
      </ul>
      {record.validation_failures?.map((f) => (
        <p key={f} className="text-xs text-destructive">
          {f}
        </p>
      ))}
      {record.source_files && record.source_files.length > 0 && (
        <div className="text-xs">
          <p className="text-muted-foreground">Files in the folder:</p>
          <ul className="mt-1 space-y-0.5">
            {record.source_files.map((f) => (
              <li key={`${f.filename}-${f.sha256}`} className="break-all">
                <span className="font-mono">{f.filename}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {f.type}
                  {f.uploaded_at ? ` · uploaded ${f.uploaded_at}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MembersPanel({
  members,
  total,
  satisfied,
  matchedId,
}: {
  members: ManualInstancePayload[];
  total: number;
  satisfied: number;
  matchedId?: string;
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div>
        <p className="text-sm font-medium">
          {satisfied} of {total} members satisfied
        </p>
        <p className="text-xs text-muted-foreground">
          One folder per member. These verdicts are what the CLI recorded and
          signed; this page checks the signature, not the folders.
        </p>
      </div>
      <ul className="divide-y rounded-md border bg-background">
        {members.map((m) => {
          const v = VERDICT_BADGE[memberVerdict(m)];
          return (
            <li key={m.id} className="space-y-1 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{memberLabel(m)}</span>
                <span className="flex items-center gap-1.5">
                  {m.id === matchedId && (
                    <Badge variant="outline" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      PDF matches
                    </Badge>
                  )}
                  {m.tier && (
                    <Badge variant="outline" className="font-mono">
                      {m.tier}
                    </Badge>
                  )}
                  <Badge variant={v.variant}>{v.text}</Badge>
                </span>
              </div>
              {m.exemption_reason && (
                <p className="text-muted-foreground">
                  Exempt: {m.exemption_reason}
                  {m.approved_by ? ` (approved by ${m.approved_by})` : ""}
                </p>
              )}
              {m.validation_failures?.map((f) => (
                <p key={f} className="text-destructive">
                  {f}
                </p>
              ))}
              {m.file_hash && (
                <p className="break-all font-mono text-muted-foreground">
                  {m.file_hash}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function VerdictBanner({ status }: { status: SigStatus }) {
  if (status.state === "verifying" || status.state === "idle") {
    return (
      <div data-testid="verdict" className="flex items-center gap-3 bg-muted px-5 py-4 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-lg font-semibold">Verifying signature…</span>
      </div>
    );
  }

  if (status.state === "valid") {
    return (
      <div data-testid="verdict" className="flex items-center gap-3 bg-emerald-500/10 px-5 py-4 text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-6 w-6" />
        <div>
          <p className="text-lg font-bold">Signature valid</p>
          <p className="text-sm opacity-80">
            The file is self-consistent: its records match the signature made
            with the public key it carries. The CLI makes a new key for every
            file, so this can&apos;t show who signed it: trust in the files
            comes from write-once storage of the evidence vault.
          </p>
          {status.result.keyFingerprint && (
            <p className="mt-1 text-xs opacity-80">
              Key fingerprint (SHA-256):{" "}
              <span className="font-mono break-all">
                {status.result.keyFingerprint}
              </span>
            </p>
          )}
        </div>
      </div>
    );
  }

  if (status.state === "invalid") {
    return (
      <div data-testid="verdict" className="flex items-center gap-3 bg-destructive/10 px-5 py-4 text-destructive">
        <XCircle className="h-6 w-6" />
        <div>
          <p className="text-lg font-bold">Signature invalid</p>
          <p className="text-sm opacity-80">{status.result.reason}</p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="verdict" className="flex items-center gap-3 bg-amber-500/10 px-5 py-4 text-amber-700 dark:text-amber-500">
      <FileWarning className="h-6 w-6" />
      <div>
        <p className="text-lg font-bold">Verification could not run</p>
        <p className="text-sm opacity-80">{status.message}</p>
      </div>
    </div>
  );
}
