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
  isEvidenceEnvelope,
  getManualManifest,
  type EvidenceEnvelope,
  type ManualManifest,
} from "@/types/envelope";
import {
  sha256Hex,
  verifyEnvelopeSignature,
  WebCryptoUnsupportedError,
  type VerifyResult,
} from "@/lib/verification/verify";

type SigStatus =
  | { state: "idle" }
  | { state: "verifying" }
  | { state: "valid"; result: VerifyResult }
  | { state: "invalid"; result: VerifyResult }
  | { state: "error"; message: string };

type PdfStatus =
  | { state: "idle" }
  | { state: "hashing"; filename: string }
  | { state: "match"; filename: string; hash: string }
  | { state: "mismatch"; filename: string; hash: string; expected: string }
  | { state: "error"; message: string };

function truncate(s: string, n = 20): string {
  if (s.length <= n * 2 + 3) return s;
  return `${s.slice(0, n)}…${s.slice(-n)}`;
}

function evidencePreview(ev: unknown): string {
  try {
    return JSON.stringify(ev, null, 2);
  } catch {
    return String(ev);
  }
}

// JSON.parse messages vary by engine; most include "position N". Turn
// that offset into a line/column so a malformed paste points somewhere.
function describeJsonError(err: Error, src: string): string {
  const m = /position (\d+)/.exec(err.message);
  if (!m) return `Invalid JSON: ${err.message}`;
  const pos = Math.min(Number(m[1]), src.length);
  const before = src.slice(0, pos);
  const line = before.split("\n").length;
  const col = pos - before.lastIndexOf("\n");
  return `Invalid JSON at line ${line}, column ${col}: ${err.message}`;
}

export function Verify() {
  const [rawJson, setRawJson] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [envelope, setEnvelope] = useState<EvidenceEnvelope | null>(null);
  const [sigStatus, setSigStatus] = useState<SigStatus>({ state: "idle" });
  const [pdfStatus, setPdfStatus] = useState<PdfStatus>({ state: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const manifest: ManualManifest | null = useMemo(
    () => (envelope ? getManualManifest(envelope) : null),
    [envelope],
  );

  // `reformat` is true for paste / file load — once the text parses we
  // pretty-print it so a minified envelope is readable. It stays false
  // for keystrokes (reformatting mid-type would jump the caret).
  const handleParse = useCallback(
    (text: string, opts?: { reformat?: boolean }) => {
      setPdfStatus({ state: "idle" });

      if (!text.trim()) {
        setRawJson(text);
        setEnvelope(null);
        setParseError(null);
        setSigStatus({ state: "idle" });
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        setRawJson(text);
        setEnvelope(null);
        setParseError(describeJsonError(err as Error, text));
        setSigStatus({ state: "idle" });
        return;
      }

      // Parsed cleanly — safe to prettify the visible text. Helps the
      // "valid JSON, wrong shape" case where the box stays on screen.
      let display = text;
      if (opts?.reformat) {
        try {
          display = JSON.stringify(parsed, null, 2);
        } catch {
          display = text;
        }
      }
      setRawJson(display);

      if (!isEvidenceEnvelope(parsed)) {
        setEnvelope(null);
        setParseError(
          "JSON does not match the EvidenceEnvelope shape. Expected fields: signed.timestamp, signed.evidence, public_key, signature.algorithm, signature.value.",
        );
        setSigStatus({ state: "idle" });
        return;
      }

      setEnvelope(parsed);
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
    verifyEnvelopeSignature(envelope)
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
  }, [envelope]);

  const handlePdfFile = useCallback(
    async (file: File) => {
      if (!manifest?.file_hash) return;
      const expected = manifest.file_hash.toLowerCase();
      setPdfStatus({ state: "hashing", filename: file.name });
      try {
        const buf = await file.arrayBuffer();
        const hash = await sha256Hex(buf);
        if (hash === expected) {
          setPdfStatus({ state: "match", filename: file.name, hash });
        } else {
          setPdfStatus({
            state: "mismatch",
            filename: file.name,
            hash,
            expected,
          });
        }
      } catch (err) {
        setPdfStatus({ state: "error", message: (err as Error).message });
      }
    },
    [manifest],
  );

  const onEnvelopeDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) void handleEnvelopeFile(file);
    },
    [handleEnvelopeFile],
  );

  const onPdfDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) void handlePdfFile(file);
    },
    [handlePdfFile],
  );

  const reset = useCallback(() => {
    setRawJson("");
    setParseError(null);
    setEnvelope(null);
    setSigStatus({ state: "idle" });
    setPdfStatus({ state: "idle" });
  }, []);

  const identityParts = useMemo(() => {
    const parts: string[] = [];
    if (manifest?.evidence_id) parts.push(manifest.evidence_id);
    parts.push(manifest ? "manual" : "automated");
    if (manifest?.period) parts.push(manifest.period);
    if (manifest?.framework) parts.push(manifest.framework);
    return parts;
  }, [manifest]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Verify signed evidence
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Public, client-side verifier for SigComply{" "}
          <code className="font-mono text-xs">EvidenceEnvelope</code> files.
          Nothing is uploaded — verification runs entirely in your browser.
        </p>
      </div>

      {/* Input — prominent until an envelope is loaded, then a thin bar. */}
      {!envelope ? (
        <div className="space-y-3">
          <div
            onDrop={onEnvelopeDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-input bg-muted/20 px-6 py-10 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/40"
          >
            <FileJson className="h-7 w-7 text-muted-foreground/70" />
            <div>
              <span className="font-medium text-foreground">
                Drop the signed envelope JSON
              </span>
              <span className="block text-xs">
                e.g.{" "}
                <code className="font-mono">evidence/aws-iam-users.json</code>
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Choose file
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
                placeholder='{ "signed": { "timestamp": "...", "evidence": ... }, "public_key": "...", "signature": { "algorithm": "ed25519", "value": "..." } }'
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
              {manifest?.evidence_id ?? "Envelope loaded"}
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

            {/* PDF hash check — manual flow only */}
            {manifest?.file_hash && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Sibling PDF</p>
                    <p className="text-xs text-muted-foreground">
                      Hash the matching{" "}
                      <code className="font-mono">evidence.pdf</code> and
                      compare to the manifest&apos;s{" "}
                      <code className="font-mono">file_hash</code>.
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
                      onDrop={onPdfDrop}
                      onDragOver={(e) => e.preventDefault()}
                      className="flex items-center justify-center gap-3 rounded-md border border-dashed border-input p-4 text-xs text-muted-foreground hover:bg-muted/40"
                    >
                      {pdfStatus.state === "hashing" ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Hashing {pdfStatus.filename}…
                        </span>
                      ) : (
                        <>
                          <span>Drop evidence.pdf here, or</span>
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
                    <span className="font-mono">{pdfStatus.filename}</span> ·
                    SHA-256{" "}
                    <span className="font-mono">{pdfStatus.hash}</span>
                  </p>
                )}
                {pdfStatus.state === "mismatch" && (
                  <div className="space-y-1 break-all text-xs">
                    <p>
                      <span className="text-muted-foreground">Got: </span>
                      <span className="font-mono">{pdfStatus.hash}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Expected: </span>
                      <span className="font-mono">{pdfStatus.expected}</span>
                    </p>
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
              <details>
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Envelope details
                </summary>
                <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                  <span className="text-muted-foreground">Timestamp</span>
                  <span className="font-mono">
                    {envelope.signed.timestamp}
                  </span>

                  <span className="text-muted-foreground">Algorithm</span>
                  <span className="font-mono">
                    {envelope.signature.algorithm}
                  </span>

                  <span className="text-muted-foreground">Public key</span>
                  <span className="font-mono break-all">
                    {truncate(envelope.public_key, 24)}
                  </span>

                  <span className="text-muted-foreground">Signature</span>
                  <span className="font-mono break-all">
                    {truncate(envelope.signature.value, 24)}
                  </span>

                  {manifest && (
                    <>
                      {manifest.file_path && (
                        <>
                          <span className="text-muted-foreground">
                            PDF path
                          </span>
                          <span className="font-mono break-all">
                            {manifest.file_path}
                          </span>
                        </>
                      )}
                      {manifest.file_hash && (
                        <>
                          <span className="text-muted-foreground">
                            Expected SHA-256
                          </span>
                          <span className="font-mono break-all">
                            {manifest.file_hash}
                          </span>
                        </>
                      )}
                    </>
                  )}
                </div>
                <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs">
                  {evidencePreview(envelope.signed.evidence)}
                </pre>
              </details>

              {(sigStatus.state === "valid" ||
                sigStatus.state === "invalid") && (
                <details>
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Canonical bytes verified
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-3 font-mono text-xs">
                    {sigStatus.result.signedBytes}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VerdictBanner({ status }: { status: SigStatus }) {
  if (status.state === "verifying" || status.state === "idle") {
    return (
      <div className="flex items-center gap-3 bg-muted px-5 py-4 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="text-lg font-semibold">Verifying signature…</span>
      </div>
    );
  }

  if (status.state === "valid") {
    return (
      <div className="flex items-center gap-3 bg-emerald-500/10 px-5 py-4 text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-6 w-6" />
        <div>
          <p className="text-lg font-bold">Signature valid</p>
          <p className="text-sm opacity-80">
            The signed payload was not modified after the CLI signed it.
          </p>
        </div>
      </div>
    );
  }

  if (status.state === "invalid") {
    return (
      <div className="flex items-center gap-3 bg-destructive/10 px-5 py-4 text-destructive">
        <XCircle className="h-6 w-6" />
        <div>
          <p className="text-lg font-bold">Signature invalid</p>
          <p className="text-sm opacity-80">{status.result.reason}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-amber-500/10 px-5 py-4 text-amber-700 dark:text-amber-500">
      <FileWarning className="h-6 w-6" />
      <div>
        <p className="text-lg font-bold">Verification could not run</p>
        <p className="text-sm opacity-80">{status.message}</p>
      </div>
    </div>
  );
}
