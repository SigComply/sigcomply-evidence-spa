import { useMemo } from "react";
import type { CatalogEntry, Frequency } from "@/types/catalog";
import { currentPeriod, formatPeriodRange } from "@/lib/period";
import { CalendarClock } from "lucide-react";

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
// Clicking a card filters the list to that frequency.
export function PeriodOverview({
  entries,
  activeFrequency,
  onSelectFrequency,
}: PeriodOverviewProps) {
  const cards = useMemo(() => {
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

  if (cards.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Current period per cadence. Counts are how many entries the catalog
        defines at that cadence — not your outstanding work (this tool can’t
        see your storage).
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => {
        const active = activeFrequency === c.frequency;
        return (
          <button
            key={c.frequency}
            type="button"
            onClick={() =>
              onSelectFrequency(active ? null : c.frequency)
            }
            aria-pressed={active}
            className={[
              "rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "bg-card hover:bg-muted/50",
            ].join(" ")}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium capitalize text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              {c.frequency}
            </div>
            <div className="mt-1.5 font-mono text-sm font-semibold">
              {c.key}
            </div>
            <div className="text-xs text-muted-foreground">{c.range}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{c.count}</span>{" "}
              attestation{c.count === 1 ? "" : "s"} in catalog
            </div>
          </button>
        );
      })}
      </div>
    </div>
  );
}
