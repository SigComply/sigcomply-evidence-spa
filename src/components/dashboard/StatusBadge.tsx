import { Pill } from "@/components/common/Pill";
import { severityTone } from "@/lib/severity";

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Pill tone={severityTone(severity)} className="capitalize">
      {severity}
    </Pill>
  );
}

// A TSC category is a label, not a status, so it stays neutral: a red
// "security" tag would read as a failure.
export function TSCBadge({ tsc }: { tsc: string }) {
  return (
    <Pill tone="slate" className="capitalize">
      {tsc}
    </Pill>
  );
}

export function OptionalBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-slate-600 px-2 py-0.5 text-xs font-medium text-slate-400">
      Optional
    </span>
  );
}
