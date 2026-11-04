import { CheckCircle2, FileWarning, Loader2, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SECTION_LABEL } from "@/components/common/styles";
import type { VerifyResult } from "@/lib/verification/verify";
import { cn } from "@/lib/utils";

export type SigStatus =
  | { state: "idle" }
  | { state: "verifying" }
  | { state: "valid"; result: VerifyResult }
  | { state: "invalid"; result: VerifyResult }
  | { state: "error"; message: string };

const TONE = {
  verifying: {
    box: "border-slate-700 bg-slate-900/40",
    tile: "bg-slate-700 text-slate-300",
    title: "text-slate-200",
  },
  valid: {
    box: "border-emerald-500/20 bg-emerald-500/10",
    tile: "bg-emerald-500/20 text-emerald-400",
    title: "text-emerald-400",
  },
  invalid: {
    box: "border-red-500/20 bg-red-500/10",
    tile: "bg-red-500/20 text-red-400",
    title: "text-red-400",
  },
  error: {
    box: "border-amber-500/20 bg-amber-500/10",
    tile: "bg-amber-500/20 text-amber-400",
    title: "text-amber-400",
  },
} as const;

// The one-line verdict sits in the hue; the explanation under it stays
// neutral, so the caveat on a valid signature doesn't read as more success.
function Banner({
  tone,
  Icon,
  spin,
  title,
  children,
}: {
  tone: keyof typeof TONE;
  Icon: LucideIcon;
  spin?: boolean;
  title: string;
  children?: React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div data-testid="verdict" className={cn("border-b px-5 py-4", t.box)}>
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            t.tile,
          )}
        >
          <Icon aria-hidden className={cn("size-5", spin && "animate-spin")} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "flex min-h-10 items-center text-lg font-bold",
              t.title,
            )}
          >
            {title}
          </p>
          {children && (
            <div className="space-y-3 text-sm text-slate-300">{children}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function VerdictBanner({ status }: { status: SigStatus }) {
  if (status.state === "verifying" || status.state === "idle") {
    return (
      <Banner
        tone="verifying"
        Icon={Loader2}
        spin
        title="Verifying signature…"
      />
    );
  }

  if (status.state === "valid") {
    return (
      <Banner tone="valid" Icon={CheckCircle2} title="Signature valid">
        <p>
          The file is self-consistent: its records match the signature and
          the public key inside it. The CLI makes a new key for every file,
          so a valid signature doesn&apos;t show who signed it. Ask whether
          the vault is write-once storage; that is what stops a file being
          replaced and signed again.
        </p>
        {status.result.keyFingerprint && (
          <div>
            <p className={SECTION_LABEL}>Key fingerprint (SHA-256)</p>
            <p className="mt-1 font-mono text-xs break-all text-slate-200">
              {status.result.keyFingerprint}
            </p>
          </div>
        )}
      </Banner>
    );
  }

  if (status.state === "invalid") {
    return (
      <Banner tone="invalid" Icon={XCircle} title="Signature invalid">
        <p>{status.result.reason}</p>
      </Banner>
    );
  }

  return (
    <Banner tone="error" Icon={FileWarning} title="Verification could not run">
      <p>{status.message}</p>
    </Banner>
  );
}
