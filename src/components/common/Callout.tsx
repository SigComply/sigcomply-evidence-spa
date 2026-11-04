import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

// Callout is the web app's inline banner: a soft tint with a matching border,
// static, never a toast.
const TONE = {
  success: {
    box: "border-emerald-500/20 bg-emerald-500/10",
    title: "text-emerald-400",
    Icon: CheckCircle2,
  },
  error: {
    box: "border-red-500/20 bg-red-500/10",
    title: "text-red-400",
    Icon: AlertCircle,
  },
  warning: {
    box: "border-amber-500/20 bg-amber-500/10",
    title: "text-amber-400",
    Icon: TriangleAlert,
  },
  info: {
    box: "border-slate-600 bg-slate-800/60",
    title: "text-slate-100",
    Icon: Info,
  },
} as const;

export function Callout({
  tone,
  title,
  children,
  className,
}: {
  tone: keyof typeof TONE;
  // Left out when a heading above already names the problem.
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div
      // An error appears in response to what the user did, so announce it.
      role={tone === "error" ? "alert" : undefined}
      className={cn("flex items-start gap-3 rounded-lg border p-4", t.box, className)}
    >
      <t.Icon className={cn("mt-0.5 size-5 shrink-0", t.title)} aria-hidden />
      <div className="min-w-0 text-sm">
        {title && <p className={cn("font-medium", t.title)}>{title}</p>}
        {children && (
          <div className={cn("text-slate-300", title && "mt-1")}>{children}</div>
        )}
      </div>
    </div>
  );
}
