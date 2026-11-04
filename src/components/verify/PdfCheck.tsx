import { CheckCircle2, Loader2, Upload, XCircle } from "lucide-react";
import { Callout } from "@/components/common/Callout";
import { Pill } from "@/components/common/Pill";
import { BUTTON_SECONDARY, INLINE_CODE } from "@/components/common/styles";
import type { ExpectedPdfHash } from "@/lib/verification/manual";
import { cn } from "@/lib/utils";

export type PdfStatus =
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

export function PdfCheck({
  status,
  fanout,
  dragActive,
  setDragActive,
  onDrop,
  inputRef,
  onFile,
}: {
  status: PdfStatus;
  fanout: boolean;
  dragActive: boolean;
  setDragActive: (on: boolean) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
}) {
  const attachments = (
    <code className={INLINE_CODE}>policies/&lt;policy_id&gt;/attachments/</code>
  );
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Evidence PDF</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            {fanout ? (
              <>
                Drop a member&apos;s PDF from the run folder&apos;s{" "}
                {attachments} to check it against each member&apos;s hash. A
                member folder that held one PDF also matches its original
                upload.
              </>
            ) : (
              <>
                Drop the PDF from the run folder&apos;s {attachments} to check
                it against the hash in this file. If the evidence folder held
                one PDF, the original upload matches too.
              </>
            )}
          </p>
        </div>
        {status.state === "match" && (
          <Pill tone="emerald">
            <CheckCircle2 aria-hidden />
            match
          </Pill>
        )}
        {status.state === "mismatch" && (
          <Pill tone="red">
            <XCircle aria-hidden />
            mismatch
          </Pill>
        )}
      </div>

      {status.state !== "match" && status.state !== "mismatch" && (
        <div
          role="region"
          aria-label="Drop the matching evidence PDF here"
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={() => setDragActive(true)}
          onDragLeave={() => setDragActive(false)}
          className={cn(
            "flex flex-wrap items-center justify-center gap-3 rounded-lg border-2 border-dashed p-4 text-sm text-slate-400 transition-colors",
            dragActive
              ? "border-indigo-500 bg-indigo-500/10"
              : "border-slate-600 bg-slate-900/40",
          )}
        >
          {status.state === "hashing" ? (
            <span className="flex items-center gap-2 text-slate-300">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              Hashing {status.filename}…
            </span>
          ) : (
            <>
              <span>Drop the PDF here, or</span>
              <button
                type="button"
                className={cn(BUTTON_SECONDARY, "px-3 py-1.5")}
                onClick={() => inputRef.current?.click()}
              >
                <Upload aria-hidden />
                Choose PDF
              </button>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {status.state === "match" && (
        // One text run, so the whole line reads (and is found) as one
        // sentence; the hash alone may break anywhere.
        <p className="text-sm break-words text-slate-400">
          <span className="font-mono break-all text-slate-300">
            {status.filename}
          </span>{" "}
          matches{" "}
          <span className="font-medium text-slate-100">
            {status.matched.label}
          </span>{" "}
          · SHA-256{" "}
          <span className="mt-1 block font-mono text-xs break-all text-slate-300">
            {status.hash}
          </span>
        </p>
      )}
      {status.state === "mismatch" && (
        <div className="space-y-1 text-sm break-all">
          <p>
            <span className="text-slate-400">Got: </span>
            <span className="font-mono text-xs text-slate-300">
              {status.hash}
            </span>
          </p>
          <p className="text-slate-400">
            {status.expected.length === 1 ? "Expected:" : "Expected one of:"}
          </p>
          {status.expected.map((e) => (
            <p key={`${e.label}-${e.hash}`}>
              {status.expected.length > 1 && (
                <span className="text-slate-400">{e.label}: </span>
              )}
              <span className="font-mono text-xs text-slate-300">{e.hash}</span>
            </p>
          ))}
        </div>
      )}
      {status.state === "error" && (
        <Callout tone="error" title="Could not hash file">
          {status.message}
        </Callout>
      )}
    </div>
  );
}
