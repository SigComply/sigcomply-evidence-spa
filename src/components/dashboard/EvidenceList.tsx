import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { CatalogEntry } from "@/types/catalog";
import { currentPeriod } from "@/lib/period";
import { ArrowRight } from "lucide-react";
import { TSCBadge, OptionalBadge } from "./StatusBadge";

function formatCategory(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface EvidenceListProps {
  entries: CatalogEntry[];
  framework: string;
}

export function EvidenceList({ entries, framework }: EvidenceListProps) {
  const grouped = useMemo(() => {
    const groups: Record<string, CatalogEntry[]> = {};
    for (const entry of entries) {
      const cat = entry.category ?? "uncategorized";
      (groups[cat] ??= []).push(entry);
    }
    // Sort categories alphabetically, entries by name within each
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, items]) => ({
        category,
        label: formatCategory(category),
        entries: items.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-4">
      {grouped.map((group) => (
        <div key={group.category}>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            {group.label} ({group.entries.length})
          </h3>
          <div className="border rounded-lg divide-y">
            {/* Column headers */}
            <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground font-medium bg-muted/30">
              <span className="flex-1">Name</span>
              <span className="hidden sm:block w-16 text-right">Control</span>
              <span className="hidden md:block w-20">Frequency</span>
              <span className="hidden lg:block w-20">Period</span>
              <span className="hidden lg:block w-14">Severity</span>
              <span className="w-4" />
            </div>
            {group.entries.map((entry) => (
              <EvidenceRow key={entry.id} entry={entry} framework={framework} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EvidenceRow({ entry, framework }: { entry: CatalogEntry; framework: string }) {
  const period = currentPeriod(entry.frequency);

  return (
    <Link
      to={`/evidence/${framework}/${entry.id}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group"
    >
      <span className="flex-1 min-w-0 text-sm truncate flex items-center gap-2">
        <span className="truncate">{entry.name}</span>
        {entry.tsc && <TSCBadge tsc={entry.tsc} />}
        {entry.optional && <OptionalBadge />}
      </span>

      <span className="hidden sm:block w-16 text-right text-xs text-muted-foreground">
        {entry.control}
      </span>
      <span className="hidden md:block w-20 text-xs text-muted-foreground capitalize">
        {entry.frequency}
      </span>
      <span className="hidden lg:block w-20 text-xs text-muted-foreground font-mono">
        {period.key}
      </span>
      <span className="hidden lg:block w-14 text-xs text-muted-foreground capitalize">
        {entry.severity}
      </span>

      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  );
}
