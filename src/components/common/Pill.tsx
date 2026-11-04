import { cn } from "@/lib/utils";

// The web app's status pill: a rounded-full label on a soft tint of its hue.
// Emerald is a pass, red a failure, amber a warning, slate neutral; orange
// and blue only appear on the severity scale.
export type PillTone =
  | "emerald"
  | "red"
  | "amber"
  | "orange"
  | "blue"
  | "indigo"
  | "slate";

const TONE: Record<PillTone, string> = {
  emerald: "bg-emerald-500/20 text-emerald-400",
  red: "bg-red-500/20 text-red-400",
  amber: "bg-amber-500/20 text-amber-400",
  orange: "bg-orange-500/20 text-orange-400",
  blue: "bg-blue-500/20 text-blue-400",
  indigo: "bg-indigo-500/20 text-indigo-300",
  slate: "bg-slate-500/20 text-slate-300",
};

export function Pill({
  tone,
  className,
  children,
}: {
  tone: PillTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
