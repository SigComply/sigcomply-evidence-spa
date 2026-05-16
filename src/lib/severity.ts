// Severity / TSC color palettes, shared by the badge components and the
// list-row accent rail. Kept in a non-component module so component files
// only export components (react-refresh / fast-refresh constraint).
//
// Every entry carries an explicit dark-mode pair — the original maps had
// light-only classes (bg-*-100 text-*-800) that were near-invisible on the
// dark theme.

const severityBadge: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
};

const severitySolid: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-green-500",
};

const tscBadge: Record<string, string> = {
  security: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  availability:
    "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  confidentiality:
    "bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300",
  privacy: "bg-pink-50 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300",
};

export function severityBadgeClass(severity: string): string {
  return severityBadge[severity] ?? "";
}

// Background for the colored accent rail down the left edge of a list row —
// the primary at-a-glance severity cue. Neutral fallback for unknowns.
export function severityRailClass(severity: string): string {
  return severitySolid[severity] ?? "bg-muted-foreground/40";
}

export function tscBadgeClass(tsc: string): string {
  return tscBadge[tsc] ?? "";
}
