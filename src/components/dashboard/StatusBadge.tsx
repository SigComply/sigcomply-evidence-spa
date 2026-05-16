import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Severity / TSC palettes. Every entry carries an explicit dark-mode pair —
// the old map only had light classes (bg-*-100 text-*-800), which rendered
// near-invisible on the dark theme.
const severityColors: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
};

const severityDot: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-green-500",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn("capitalize", severityColors[severity] ?? "")}
    >
      {severity}
    </Badge>
  );
}

// Compact severity indicator for dense list rows — a colored dot plus the
// label, far lighter than a full badge when shown on every row.
export function SeverityDot({
  severity,
  className,
}: {
  severity: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground capitalize",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          severityDot[severity] ?? "bg-muted-foreground",
        )}
      />
      {severity}
    </span>
  );
}

const tscColors: Record<string, string> = {
  security: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  availability:
    "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  confidentiality:
    "bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300",
  privacy: "bg-pink-50 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300",
};

export function TSCBadge({ tsc }: { tsc: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn("capitalize", tscColors[tsc] ?? "")}
    >
      {tsc}
    </Badge>
  );
}

export function OptionalBadge() {
  return (
    <Badge variant="outline" className="text-xs">
      Optional
    </Badge>
  );
}
