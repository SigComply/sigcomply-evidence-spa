import { useCallback, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, FileJson, FileWarning, ShieldCheck, Upload, XCircle } from "lucide-react";
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

  const handleParse = useCallback((text: string) => {
    setRawJson(text);
    setSigStatus({ state: "idle" });
    setPdfStatus({ state: "idle" });

    if (!text.trim()) {
      setEnvelope(null);
      setParseError(null);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      setEnvelope(null);
      setParseError(`Invalid JSON: ${(err as Error).message}`);
      return;
    }

    if (!isEvidenceEnvelope(parsed)) {
      setEnvelope(null);
      setParseError(
        'JSON does not match the EvidenceEnvelope shape. Expected fields: signed.timestamp, signed.evidence, public_key, signature.algorithm, signature.value.',
      );
      return;
    }

    setEnvelope(parsed);
    setParseError(null);
  }, []);

  const handleEnvelopeFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        handleParse(text);
      } catch (err) {
        setParseError(`Could not read file: ${(err as Error).message}`);
      }
    },
    [handleParse],
  );

  const handleVerify = useCallback(async () => {
    if (!envelope) return;
    setSigStatus({ state: "verifying" });
    try {
      const result = await verifyEnvelopeSignature(envelope);
      setSigStatus({ state: result.valid ? "valid" : "invalid", result });
    } catch (err) {
      if (err instanceof WebCryptoUnsupportedError) {
        setSigStatus({ state: "error", message: err.message });
      } else {
        setSigStatus({ state: "error", message: (err as Error).message });
      }
    }
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
          setPdfStatus({ state: "mismatch", filename: file.name, hash, expected });
        }
      } catch (err) {
        setPdfStatus({ state: "error", message: (err as Error).message });
      }
    },
    [manifest],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) void handleEnvelopeFile(file);
    },
    [handleEnvelopeFile],
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Verify signed evidence
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Public, client-side verifier for SigComply <code className="font-mono text-xs">EvidenceEnvelope</code> files.
          Nothing is uploaded — verification runs entirely in your browser.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Provide the signed envelope</CardTitle>
          <CardDescription>
            Drop the JSON file (e.g. <code className="font-mono text-xs">evidence/aws-iam-users.json</code>),
            or paste its contents below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex items-center justify-center gap-3 rounded-lg border border-dashed border-input p-6 text-sm text-muted-foreground hover:bg-muted/40"
          >
            <FileJson className="h-5 w-5" />
            <span>Drop envelope JSON here, or</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
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

          <div>
            <Label htmlFor="envelope-json" className="text-xs text-muted-foreground">
              Or paste JSON
            </Label>
            <Textarea
              id="envelope-json"
              value={rawJson}
              onChange={(e) => handleParse(e.target.value)}
              placeholder='{ "signed": { "timestamp": "...", "evidence": ... }, "public_key": "...", "signature": { "algorithm": "ed25519", "value": "..." } }'
              className="font-mono text-xs h-40 mt-1"
              spellCheck={false}
            />
          </div>

          {parseError && (
            <Alert variant="destructive">
              <FileWarning className="h-4 w-4" />
              <AlertTitle>Could not parse envelope</AlertTitle>
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {envelope && (
        <Card>
          <CardHeader>
            <CardTitle>2. Envelope contents</CardTitle>
            <CardDescription>The pieces that will be verified.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <span className="text-muted-foreground">Timestamp</span>
              <span className="font-mono">{envelope.signed.timestamp}</span>

              <span className="text-muted-foreground">Algorithm</span>
              <span className="font-mono">{envelope.signature.algorithm}</span>

              <span className="text-muted-foreground">Public key</span>
              <span className="font-mono break-all">{truncate(envelope.public_key, 24)}</span>

              <span className="text-muted-foreground">Signature</span>
              <span className="font-mono break-all">{truncate(envelope.signature.value, 24)}</span>

              {manifest && (
                <>
                  <span className="text-muted-foreground">Flow</span>
                  <span>
                    <Badge>manual</Badge>
                  </span>
                  {manifest.evidence_id && (
                    <>
                      <span className="text-muted-foreground">Evidence ID</span>
                      <span className="font-mono">{manifest.evidence_id}</span>
                    </>
                  )}
                  {manifest.framework && (
                    <>
                      <span className="text-muted-foreground">Framework</span>
                      <span className="font-mono">{manifest.framework}</span>
                    </>
                  )}
                  {manifest.period && (
                    <>
                      <span className="text-muted-foreground">Period</span>
                      <span className="font-mono">{manifest.period}</span>
                    </>
                  )}
                  {manifest.file_path && (
                    <>
                      <span className="text-muted-foreground">PDF path</span>
                      <span className="font-mono break-all">{manifest.file_path}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">Expected SHA-256</span>
                  <span className="font-mono break-all">{manifest.file_hash}</span>
                </>
              )}
              {!manifest && (
                <>
                  <span className="text-muted-foreground">Flow</span>
                  <span>
                    <Badge variant="secondary">automated</Badge>
                  </span>
                </>
              )}
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Raw <code className="font-mono text-xs">signed.evidence</code> payload
              </summary>
              <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs">
                {evidencePreview(envelope.signed.evidence)}
              </pre>
            </details>
          </CardContent>
        </Card>
      )}

      {envelope && (
        <Card>
          <CardHeader>
            <CardTitle>3. Verify the Ed25519 signature</CardTitle>
            <CardDescription>
              Recanonicalises <code className="font-mono text-xs">signed</code> (sorted keys, no whitespace) and
              verifies it against the embedded public key.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleVerify} disabled={sigStatus.state === "verifying"}>
              {sigStatus.state === "verifying" ? "Verifying…" : "Verify signature"}
            </Button>

            {sigStatus.state === "valid" && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Signature is valid</AlertTitle>
                <AlertDescription>
                  The signed payload was not modified after the CLI signed it.
                </AlertDescription>
              </Alert>
            )}

            {sigStatus.state === "invalid" && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Signature is invalid</AlertTitle>
                <AlertDescription>{sigStatus.result.reason}</AlertDescription>
              </Alert>
            )}

            {sigStatus.state === "error" && (
              <Alert variant="destructive">
                <FileWarning className="h-4 w-4" />
                <AlertTitle>Verification could not run</AlertTitle>
                <AlertDescription>{sigStatus.message}</AlertDescription>
              </Alert>
            )}

            {(sigStatus.state === "valid" || sigStatus.state === "invalid") && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Show canonical bytes that were verified
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-3 font-mono">
                  {sigStatus.result.signedBytes}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {envelope && manifest?.file_hash && (
        <Card>
          <CardHeader>
            <CardTitle>4. Verify the sibling PDF</CardTitle>
            <CardDescription>
              Manual evidence: hash the PDF and compare to{" "}
              <code className="font-mono text-xs">file_hash</code> from the manifest.
              Pull the file from{" "}
              {manifest.file_path ? (
                <code className="font-mono text-xs">{manifest.file_path}</code>
              ) : (
                "the customer's storage"
              )}
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => pdfInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Choose evidence.pdf
              </Button>
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
              {pdfStatus.state === "hashing" && (
                <span className="text-sm text-muted-foreground">
                  Hashing {pdfStatus.filename}…
                </span>
              )}
            </div>

            {pdfStatus.state === "match" && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>PDF hash matches</AlertTitle>
                <AlertDescription className="space-y-1">
                  <div>
                    <span className="text-muted-foreground">File: </span>
                    <span className="font-mono">{pdfStatus.filename}</span>
                  </div>
                  <div className="break-all">
                    <span className="text-muted-foreground">SHA-256: </span>
                    <span className="font-mono">{pdfStatus.hash}</span>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {pdfStatus.state === "mismatch" && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>PDF hash does not match</AlertTitle>
                <AlertDescription className="space-y-1">
                  <div className="break-all">
                    <span className="text-muted-foreground">Got: </span>
                    <span className="font-mono">{pdfStatus.hash}</span>
                  </div>
                  <div className="break-all">
                    <span className="text-muted-foreground">Expected: </span>
                    <span className="font-mono">{pdfStatus.expected}</span>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {pdfStatus.state === "error" && (
              <Alert variant="destructive">
                <FileWarning className="h-4 w-4" />
                <AlertTitle>Could not hash file</AlertTitle>
                <AlertDescription>{pdfStatus.message}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
