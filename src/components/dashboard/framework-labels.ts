// The one place a framework id gets its display name, so the switcher and
// the first-visit picker never disagree. An unknown id shows as itself.
const FRAMEWORK_LABELS: Record<string, string> = {
  soc2: "SOC 2 Type II",
  iso27001: "ISO 27001",
};

export function frameworkLabel(framework: string): string {
  return FRAMEWORK_LABELS[framework] ?? framework;
}
