import { useMemo } from "react";
import type { CatalogEntry, Frequency } from "@/types/catalog";
import { currentPeriod, formatPeriodRange } from "@/lib/period";
import { cn } from "@/lib/utils";
import { CARD, FOCUS_RING, SECTION_LABEL } from "@/components/common/styles";

const FREQUENCY_ORDER: Frequency[] = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];

interface PeriodOverviewProps {
  entries: CatalogEntry[];
  activeFrequency: string | null;
  onSelectFrequency: (f: string | null) => void;
}

// PeriodOverview orients the dashboard around the *current period* for each
// cadence the catalog uses. Both numbers are generic catalog facts, NOT
// customer status: the period key is a calendar fact, and the count is
// simply "how many entries in this (generic, our-built) catalog use this
// cadence". This static helper has no bucket access — it cannot and must
// not imply anything is owed, due, done, or overdue for a given customer.
// With more than one cadence a tile filters the list to it; with one, a
// filter would change nothing, so the tile is plain text.
export function PeriodOverview({
  entries,
  activeFrequency,
  onSelectFrequency,
}: PeriodOverviewProps) {
  const tiles = useMemo(() => {
    const byFreq = new Map<Frequency, number>();
    for (const e of entries) {
      byFreq.set(e.frequency, (byFreq.get(e.frequency) ?? 0) + 1);
    }
    return FREQUENCY_ORDER.filter((f) => byFreq.has(f)).map((f) => {
      const p = currentPeriod(f);
      return {
        frequency: f,
        count: byFreq.get(f) ?? 0,
        key: p.key,
        range: formatPeriodRange(p),
      };
    });
  }, [entries]);

  if (tiles.length === 0) return null;
  const filterable = tiles.length > 1;

  return (
    <section className={cn(CARD, "p-5")} aria-labelledby="current-periods">
      <h2 id="current-periods" className="text-base font-semibold text-white">
        Current periods
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-5">
        {tiles.map((t) => {
          const active = activeFrequency === t.frequency;
          const body = (
            <>
              <span className={cn(SECTION_LABEL, "block")}>{t.frequency}</span>
              <span className="mt-2 block font-mono text-xl font-semibold text-white">
                {t.key}
              </span>
              <span className="mt-0.5 block text-sm text-slate-400">{t.range}</span>
              <span className="mt-3 block text-sm text-slate-300">
                <span className="font-semibold text-white">{t.count}</span>{" "}
                attestation{t.count === 1 ? "" : "s"} in catalog
              </span>
            </>
          );
          const tileClass = "rounded-lg border p-4 text-left";
          if (!filterable) {
            return (
              <div
                key={t.frequency}
                className={cn(tileClass, "border-transparent bg-slate-900/50")}
              >
                {body}
              </div>
            );
          }
          return (
            <button
              key={t.frequency}
              type="button"
              onClick={() => onSelectFrequency(active ? null : t.frequency)}
              aria-pressed={active}
              className={cn(
                tileClass,
                "cursor-pointer transition-colors",
                FOCUS_RING,
                active
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-transparent bg-slate-900/50 hover:border-slate-600",
              )}
            >
              {body}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-slate-400">
        {filterable && "Select a period to filter the list. "}
        Counts are catalog entries, not what you still need to upload: this
        page can’t see your storage.
      </p>
    </section>
  );
}
