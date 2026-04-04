import { useState, useMemo } from "react";
import { FrameworkSelector } from "@/components/dashboard/FrameworkSelector";
import { EvidenceList } from "@/components/dashboard/EvidenceList";
import { useCatalog } from "@/hooks/useCatalog";
import { getConfig } from "@/config/runtime";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import type { EvidenceType } from "@/types/catalog";

const typeFilters: { value: EvidenceType; label: string }[] = [
  { value: "document_upload", label: "Upload" },
  { value: "checklist", label: "Checklist" },
  { value: "declaration", label: "Declaration" },
];

const frequencyFilters = ["daily", "weekly", "monthly", "quarterly", "yearly"] as const;

export function Dashboard() {
  const config = getConfig();
  const [framework, setFramework] = useState(config.frameworks[0] ?? "soc2");
  const { catalog, loading, error } = useCatalog(framework);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<EvidenceType | null>(null);
  const [frequencyFilter, setFrequencyFilter] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    if (!catalog) return [];

    const query = search.toLowerCase().trim();

    return catalog.entries.filter((entry) => {
      if (typeFilter && entry.type !== typeFilter) return false;
      if (frequencyFilter && entry.frequency !== frequencyFilter) return false;
      if (query) {
        const haystack =
          `${entry.name} ${entry.description} ${entry.control} ${entry.id}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [catalog, search, typeFilter, frequencyFilter]);

  const hasActiveFilters = search || typeFilter || frequencyFilter;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Manual Evidence</h2>
          <p className="text-muted-foreground text-sm">
            Fill out and download evidence files for compliance
          </p>
        </div>
        <FrameworkSelector
          value={framework}
          onChange={setFramework}
          frameworks={config.frameworks}
        />
      </div>

      {/* Search + Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search evidence..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {typeFilters.map((t) => (
            <Badge
              key={t.value}
              variant={typeFilter === t.value ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => setTypeFilter(typeFilter === t.value ? null : t.value)}
            >
              {t.label}
            </Badge>
          ))}

          <span className="w-px h-4 bg-border mx-1" />

          {frequencyFilters.map((f) => (
            <Badge
              key={f}
              variant={frequencyFilter === f ? "default" : "outline"}
              className="cursor-pointer capitalize text-xs"
              onClick={() => setFrequencyFilter(frequencyFilter === f ? null : f)}
            >
              {f}
            </Badge>
          ))}

          {hasActiveFilters && (
            <>
              <span className="w-px h-4 bg-border mx-1" />
              <button
                className="text-xs text-muted-foreground hover:text-foreground underline"
                onClick={() => {
                  setSearch("");
                  setTypeFilter(null);
                  setFrequencyFilter(null);
                }}
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive py-4">{error}</p>
      )}

      {/* Results */}
      {!loading && !error && (
        <>
          {hasActiveFilters && catalog && (
            <p className="text-xs text-muted-foreground">
              {filteredEntries.length} of {catalog.entries.length} entries
            </p>
          )}

          <EvidenceList entries={filteredEntries} framework={framework} />

          {filteredEntries.length === 0 && catalog && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No evidence entries match your filters.
            </p>
          )}
        </>
      )}
    </div>
  );
}
