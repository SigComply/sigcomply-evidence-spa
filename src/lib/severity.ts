import type { PillTone } from "@/components/common/Pill";

// Severity hues follow the SigComply web app's scale, which is kept apart
// from the pass/fail status hues: critical red, high orange, medium (or
// moderate) amber, low blue. Anything else is neutral.
const TONES: Record<string, PillTone> = {
  critical: "red",
  high: "orange",
  medium: "amber",
  moderate: "amber",
  low: "blue",
};

export function severityTone(severity: string): PillTone {
  return TONES[severity.toLowerCase()] ?? "slate";
}
