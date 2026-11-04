import type { PillTone } from "@/components/common/Pill";

// Severity hues follow the SigComply web app's scale: critical red, high
// orange, medium (or moderate) amber, low blue. Anything else is neutral.
// Red and amber also mean failed and warning, so a severity pill always
// carries its word.
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
