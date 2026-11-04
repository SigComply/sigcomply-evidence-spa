import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/common/styles";
import { frameworkLabel } from "./framework-labels";

interface FrameworkSelectorProps {
  value: string;
  onChange: (value: string) => void;
  frameworks: string[];
}

// A segmented switcher, as in the web app: with two or three frameworks one
// click beats opening a dropdown.
export function FrameworkSelector({ value, onChange, frameworks }: FrameworkSelectorProps) {
  // With a single configured framework a control that can't change anything
  // is pure noise, so show a static label instead.
  if (frameworks.length <= 1) {
    return (
      <span className="inline-flex h-9 items-center rounded-lg border border-slate-700 px-3 text-sm font-medium text-slate-300">
        {frameworkLabel(value)}
      </span>
    );
  }

  return (
    <div
      role="group"
      aria-label="Framework"
      className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-700 bg-slate-800 p-1"
    >
      {frameworks.map((fw) => {
        const active = fw === value;
        return (
          <button
            key={fw}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(fw)}
            className={cn(
              "cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              FOCUS_RING,
              active
                ? "bg-indigo-600 text-white"
                : "text-slate-300 hover:bg-slate-700 hover:text-white",
            )}
          >
            {frameworkLabel(fw)}
          </button>
        );
      })}
    </div>
  );
}
