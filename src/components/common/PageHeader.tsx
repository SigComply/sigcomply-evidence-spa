import { useEffect, useRef } from "react";
import { HEADING_FOCUS, takePendingHeadingFocus } from "./page-focus";

// PageHeader is the title block every page starts with: one h1, an optional
// subtitle, and optional actions on the right that wrap below on a phone.
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (takePendingHeadingFocus()) heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 max-w-3xl">
        <h1
          ref={heading}
          tabIndex={-1}
          className={`text-2xl font-bold tracking-tight break-words text-white ${HEADING_FOCUS}`}
        >
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
