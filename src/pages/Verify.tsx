import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileJson, RotateCcw, Upload } from "lucide-react";
import { Callout } from "@/components/common/Callout";
import { PageHeader } from "@/components/common/PageHeader";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CARD,
  INLINE_CODE,
  INPUT,
} from "@/components/common/styles";
import {
  DisclosureSummary,
  LazyDetails,
} from "@/components/verify/Disclosure";
import { PdfCheck, type PdfStatus } from "@/components/verify/PdfCheck";
import { MembersPanel, RecordedPanel } from "@/components/verify/RecordPanels";
import {
  VerdictBanner,
  type SigStatus,
} from "@/components/verify/VerdictBanner";
import { cn } from "@/lib/utils";
import {
  getManualDocumentPayload,
  type EvidenceEnvelope,
  type ManualDocumentPayload,
} from "@/types/envelope";
import {
  sha256Hex,
  verifyEnvelopeSignature,
  WebCryptoUnsupportedError,
} from "@/lib/verification/verify";
import {
  expectedPdfHashes,
  matchPdfHash,
  type ExpectedPdfHash,
} from "@/lib/verification/manual";
import { parseEnvelopeText } from "@/lib/verification/parse-envelope";
import { parseJSONPreservingNumbers } from "@/lib/verification/canonical";
import { prettyJSON } from "@/lib/verification/pretty";
import {
  pickFile,
  useFileDrop,
  useWindowDropGuard,
} from "@/components/verify/useFileDrop";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

// The page's tests import these from here.
export { VerdictBanner, type SigStatus };

const PASTED = "Pasted envelope";
const EXAMPLE_PATH =
  "policies/<policy_id>/envelopes/directory_user__aws.iam.json";

// Lets a narrow screen break the example path after a "/" rather than inside
// a name.
function BreakablePath({ path }: { path: string }) {
  const parts = path.split("/");
  return parts.map((part, i) => (
    <span key={i}>
      {part}
      {i < parts.length - 1 && (
        <>
          /<wbr />
        </>
      )}
    </span>
  ));
}

function truncate(s: string, n = 20): string {
  if (s.length <= n * 2 + 3) return s;
  return `${s.slice(0, n)}…${s.slice(-n)}`;
}

// The raw records view, printed from a lexeme-preserving parse of the file's
// own text, so integers above 2^53 show as written rather than rounded.
function previewRecords(sourceText: string, fallback: unknown): string {
  try {
    const raw = parseJSONPreservingNumbers(sourceText) as { records?: unknown };
    return prettyJSON(raw.records);
  } catch {
    return JSON.stringify(fallback, null, 2);
  }
}

export function Verify() {
  useDocumentTitle("Verify");
  useWindowDropGuard();
  const [rawJson, setRawJson] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [envelope, setEnvelope] = useState<EvidenceEnvelope | null>(null);
  // The original, un-reformatted envelope text — used to derive canonical
  // bytes from a lexeme-preserving parse (so large integers aren't rounded).
  // Kept separate from `rawJson`, which may be pretty-printed for display.
  const [sourceText, setSourceText] = useState("");
  // What the loaded bar names: the file's own name, never a payload field,
  // which means nothing until the signature checks out.
  const [loadedName, setLoadedName] = useState(PASTED);
  const [sigStatus, setSigStatus] = useState<SigStatus>({ state: "idle" });
  const [pdfStatus, setPdfStatus] = useState<PdfStatus>({ state: "idle" });
  // Which file a multi-file drop used, shown under the zone it was dropped on.
  const [envNote, setEnvNote] = useState<string | null>(null);
  const [pdfNote, setPdfNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const envChooseRef = useRef<HTMLButtonElement>(null);
  const pdfChooseRef = useRef<HTMLButtonElement>(null);
  const verdictRef = useRef<HTMLHeadingElement>(null);
  // A reset unmounts the button that had focus; this names the button to
  // focus once its zone is back on screen.
  const pendingFocus = useRef<"envelope" | "pdf" | null>(null);
  // Bumped whenever the loaded envelope or PDF check starts over, so a hash
  // that finishes later can't report against the wrong record.
  const pdfRun = useRef(0);

  const manualDoc: ManualDocumentPayload | null = useMemo(
    () => (envelope ? getManualDocumentPayload(envelope) : null),
    [envelope],
  );

  const pdfHashes: ExpectedPdfHash[] = useMemo(
    () => (manualDoc ? expectedPdfHashes(manualDoc) : []),
    [manualDoc],
  );
  const members = manualDoc?.instances;
  // Payload fields are shown only once the signature vouches for them; until
  // then the raw records block, labelled as unverified, is the only place
  // they appear.
  const signedDoc = sigStatus.state === "valid" ? manualDoc : null;

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
    (text: string, opts?: { reformat?: boolean; name?: string }) => {
      pdfRun.current++;
      setLoadedName(opts?.name ?? PASTED);
      setPdfStatus({ state: "idle" });
      setPdfNote(null);
      if (!opts?.name) setEnvNote(null);

      const result = parseEnvelopeText(text, { name: opts?.name });
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
    async (file: File, note: string | null = null) => {
      setEnvNote(note);
      try {
        const text = await file.text();
        handleParse(text, { reformat: true, name: file.name });
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
    async (file: File, note: string | null = null) => {
      if (!manualDoc || pdfHashes.length === 0) return;
      setPdfNote(note);
      // Guard against an obviously-wrong file so a hash mismatch doesn't read
      // as "the evidence was tampered with" when the user simply dropped the
      // wrong file. The manifest hashes the merged evidence.pdf.
      const looksPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
      if (!looksPdf) {
        setPdfStatus({
          state: "error",
          title: "Not a PDF",
          message: `“${file.name}” doesn't look like a PDF. Drop the PDF from the run folder's attachments/, or the original upload if the folder held one PDF.`,
        });
        return;
      }
      const run = ++pdfRun.current;
      setPdfStatus({ state: "hashing", filename: file.name });
      try {
        const buf = await file.arrayBuffer();
        const hash = await sha256Hex(buf);
        if (run !== pdfRun.current) return;
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
        if (run !== pdfRun.current) return;
        setPdfStatus({ state: "error", message: (err as Error).message });
      }
    },
    [manualDoc, pdfHashes],
  );

  // Several files dropped at once: each zone takes the one of its own kind.
  const envDrop = useFileDrop(
    useCallback(
      (files: File[]) => {
        const { file, note } = pickFile(files, ".json", "application/json");
        if (file) void handleEnvelopeFile(file, note);
      },
      [handleEnvelopeFile],
    ),
  );
  const pdfDrop = useFileDrop(
    useCallback(
      (files: File[]) => {
        const { file, note } = pickFile(files, ".pdf", "application/pdf");
        if (file) void handlePdfFile(file, note);
      },
      [handlePdfFile],
    ),
  );

  // Once the verdict lands, move focus to it: the drop zone that had focus
  // is gone.
  useEffect(() => {
    const s = sigStatus.state;
    if (s === "valid" || s === "invalid" || s === "error") {
      verdictRef.current?.focus();
    }
  }, [sigStatus.state]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const el = target === "envelope" ? envChooseRef.current : pdfChooseRef.current;
    if (el) {
      el.focus();
      pendingFocus.current = null;
    }
  });

  const resetPdf = useCallback(() => {
    pdfRun.current++;
    setPdfStatus({ state: "idle" });
    setPdfNote(null);
    pendingFocus.current = "pdf";
  }, []);

  const reset = useCallback(() => {
    pendingFocus.current = "envelope";
    setEnvNote(null);
    setPdfNote(null);
    pdfRun.current++;
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
    if (signedDoc?.evidence_id) parts.push(signedDoc.evidence_id);
    parts.push(manualDoc ? "manual" : "automated");
    if (signedDoc?.period_id) parts.push(signedDoc.period_id);
    return parts;
  }, [manualDoc, signedDoc]);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Verify signed evidence"
        subtitle="For auditors. Check the signature on an evidence file the SigComply CLI wrote to the vault, and check a PDF against the hash it records. Everything runs in your browser, and nothing is uploaded."
      />

      {/* Input: prominent until an envelope is loaded, then a thin bar. */}
      {!envelope ? (
        <div className="space-y-4">
          <div
            role="region"
            aria-label="Drop the signed envelope JSON file here"
            data-drag-active={envDrop.active}
            {...envDrop.handlers}
            className={cn(
              "flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
              envDrop.active
                ? "border-indigo-500 bg-indigo-500/10"
                : "border-slate-600 bg-slate-800/50",
            )}
          >
            <div className="flex size-12 items-center justify-center rounded-xl bg-slate-700 text-slate-300">
              <FileJson aria-hidden className="size-6" />
            </div>
            <div className="max-w-md space-y-1">
              <p className="text-base font-semibold text-white">
                Drop the signed envelope JSON
              </p>
              <p className="text-sm break-words text-slate-400">
                from the run folder in the vault, e.g.{" "}
                <code className={INLINE_CODE}>
                  <BreakablePath path={EXAMPLE_PATH} />
                </code>
              </p>
              <p className="text-sm text-slate-400">
                Once it verifies, you can check the merged PDF from the
                attachments/ folder.
              </p>
            </div>
            <button
              ref={envChooseRef}
              type="button"
              className={BUTTON_PRIMARY}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload aria-hidden />
              Choose envelope file
            </button>
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

          <details className="group">
            <DisclosureSummary>…or paste JSON</DisclosureSummary>
            <div className="mt-3">
              <Label htmlFor="envelope-json" className="sr-only">
                Envelope JSON
              </Label>
              <Textarea
                id="envelope-json"
                value={rawJson}
                onChange={(e) => handleParse(e.target.value)}
                onPaste={handlePaste}
                placeholder='{ "format_version": "envelope.v1", "produced_at": "...", "records": [ ... ], "signature": { "algorithm": "ed25519", "public_key": "...", "value": "..." } }'
                className={cn(
                  INPUT,
                  "h-48 resize-y font-mono text-xs leading-relaxed",
                )}
                spellCheck={false}
              />
            </div>
          </details>

          {envNote && <p className="text-sm text-slate-400">{envNote}</p>}

          {parseError && (
            <Callout tone="error" title="Could not parse envelope">
              {parseError}
            </Callout>
          )}
        </div>
      ) : (
        <div
          data-testid="loaded-envelope"
          className={cn(CARD, "flex items-center justify-between gap-3 px-4 py-3")}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-slate-300">
              <FileJson aria-hidden className="size-4" />
            </span>
            <span
              className="truncate font-mono text-sm text-slate-200"
              title={loadedName}
            >
              {loadedName}
            </span>
          </span>
          <button
            type="button"
            className={cn(BUTTON_SECONDARY, "shrink-0 px-3 py-1.5")}
            onClick={reset}
          >
            <RotateCcw aria-hidden />
            Verify another
          </button>
        </div>
      )}

      {envelope && envNote && (
        <p className="text-sm text-slate-400">{envNote}</p>
      )}

      {envelope && (
        <div className={cn(CARD, "overflow-hidden")}>
          <VerdictBanner status={sigStatus} headingRef={verdictRef} />

          {/* Identity and what the file holds */}
          <section className="space-y-3 px-5 py-4">
            <div className="flex flex-wrap items-center gap-1.5">
              {identityParts.map((p, i) => (
                <Badge
                  key={`${p}-${i}`}
                  variant="outline"
                  className={cn(
                    "h-auto rounded-full px-2 py-0.5 font-mono text-xs",
                    p === "manual"
                      ? "border-indigo-500/30 bg-indigo-500/15 text-indigo-300"
                      : "border-slate-600 bg-slate-700/50 text-slate-200",
                  )}
                >
                  {p}
                </Badge>
              ))}
            </div>
            {recordSummary && (
              <p className="text-sm text-slate-400">
                <span className="font-medium text-slate-200">
                  {recordSummary.count}{" "}
                  {recordSummary.count === 1 ? "record" : "records"}
                </span>
                {" · "}
                {recordSummary.types.length === 0 ? (
                  <span className="italic">no record types</span>
                ) : (
                  recordSummary.types.map((t, i) => (
                    <span key={t}>
                      <code className={INLINE_CODE}>{t}</code>
                      {i < recordSummary.types.length - 1 ? ", " : ""}
                    </span>
                  ))
                )}
              </p>
            )}
          </section>

          {/* The CLI's signed verdicts and the PDF check mean something
              only once the signature checks out. */}
          {manualDoc && sigStatus.state !== "valid" && (
            <section className="border-t border-slate-700 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">
                Recorded results and PDF check
              </h2>
              <p className="mt-0.5 text-sm text-slate-400">
                {sigStatus.state === "invalid" || sigStatus.state === "error"
                  ? "Hidden because the signature isn't valid. Don't rely on the results or hashes in this file."
                  : "Shown after the signature checks out."}
              </p>
            </section>
          )}

          {/* Fan-out members: the CLI's signed per-member verdicts */}
          {sigStatus.state === "valid" && members && members.length > 0 && (
            <section className="border-t border-slate-700 px-5 py-4">
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
            </section>
          )}

          {/* Single-folder record: the CLI's signed verdict fields */}
          {sigStatus.state === "valid" &&
            manualDoc &&
            !(members && members.length > 0) && (
              <section className="border-t border-slate-700 px-5 py-4">
                <RecordedPanel record={manualDoc} />
              </section>
            )}

          {/* PDF hash check: only against hashes a valid signature vouches for */}
          {pdfHashes.length > 0 && sigStatus.state === "valid" && (
            <section className="border-t border-slate-700 px-5 py-4">
              <PdfCheck
                status={pdfStatus}
                fanout={!!members}
                dragActive={pdfDrop.active}
                dropHandlers={pdfDrop.handlers}
                inputRef={pdfInputRef}
                chooseRef={pdfChooseRef}
                onFile={(f) => void handlePdfFile(f)}
                onReset={resetPdf}
                note={pdfNote}
              />
            </section>
          )}

          {/* Details: plumbing behind disclosures */}
          <section className="space-y-3 border-t border-slate-700 px-5 py-4 text-sm">
            <LazyDetails summary="Envelope details">
              {() => (
                <>
                  <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
                    <span className="text-slate-400">Format</span>
                    <span className="font-mono text-slate-200">
                      {envelope.format_version}
                    </span>

                    <span className="text-slate-400">Produced at</span>
                    <span className="font-mono text-slate-200">
                      {envelope.produced_at}
                    </span>

                    <span className="text-slate-400">Algorithm</span>
                    <span className="font-mono text-slate-200">
                      {envelope.signature.algorithm}
                    </span>

                    <span className="text-slate-400">Public key</span>
                    <span className="font-mono break-all text-slate-200">
                      {truncate(envelope.signature.public_key, 24)}
                    </span>

                    <span className="text-slate-400">Signature</span>
                    <span className="font-mono break-all text-slate-200">
                      {truncate(envelope.signature.value, 24)}
                    </span>

                    {signedDoc && (
                      <>
                        {signedDoc.expected_uri && (
                          <>
                            <span className="text-slate-400">Folder URI</span>
                            <span className="font-mono break-all text-slate-200">
                              {signedDoc.expected_uri}
                            </span>
                          </>
                        )}
                        {signedDoc.file_hash && (
                          <>
                            <span className="text-slate-400">
                              Expected SHA-256
                            </span>
                            <span className="font-mono break-all text-slate-200">
                              {signedDoc.file_hash}
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  {sigStatus.state !== "valid" && (
                    <p className="mt-4 text-sm font-semibold text-red-400">
                      Unverified file contents
                    </p>
                  )}
                  <pre
                    data-raw
                    className="mt-2 max-h-96 overflow-auto rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-xs text-slate-300"
                  >
                    {previewRecords(sourceText, envelope.records)}
                  </pre>
                </>
              )}
            </LazyDetails>

            {(sigStatus.state === "valid" || sigStatus.state === "invalid") && (
              <LazyDetails summary="Bytes the signature covers">
                {() => (
                  <pre
                    data-raw
                    className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-xs text-slate-300"
                  >
                    {sigStatus.result.signedBytes}
                  </pre>
                )}
              </LazyDetails>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
