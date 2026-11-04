import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { FOCUS_RING } from "@/components/common/styles";
import { cn } from "@/lib/utils";

// A <details> summary drawn with our own chevron: the native triangle differs
// per browser and can't take the theme's colour.
export function DisclosureSummary({ children }: { children: React.ReactNode }) {
  return (
    <summary
      className={cn(
        "inline-flex cursor-pointer list-none items-center gap-1.5 rounded text-sm text-slate-400 select-none hover:text-slate-200 [&::-webkit-details-marker]:hidden",
        FOCUS_RING,
      )}
    >
      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 transition-transform group-open:rotate-90"
      />
      <span>{children}</span>
    </summary>
  );
}

// LazyDetails renders its body only while open: a large envelope's records
// pretty-printed into the DOM took gigabytes of memory even when collapsed.
export function LazyDetails({
  summary,
  children,
}: {
  summary: string;
  children: () => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details className="group" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <DisclosureSummary>{summary}</DisclosureSummary>
      {open && children()}
    </details>
  );
}
