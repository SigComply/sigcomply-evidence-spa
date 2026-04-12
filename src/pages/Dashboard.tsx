import { useState, useMemo, useCallback } from "react";
import { FrameworkSelector } from "@/components/dashboard/FrameworkSelector";
import { FrameworkPickerDialog } from "@/components/dashboard/FrameworkPickerDialog";
import { EvidenceList } from "@/components/dashboard/EvidenceList";
import { useCatalog } from "@/hooks/useCatalog";
import { getConfig } from "@/config/runtime";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import type { EvidenceType } from "@/types/catalog";

const STORAGE_KEY = "sigcomply:framework";

const typeFilters: { value: EvidenceType; label: string }[] = [
  { value: "document_upload", label: "Upload" },
  { value: "checklist", label: "Checklist" },
  { value: "declaration", label: "Declaration" },
];

const frequencyFilters = ["daily", "weekly", "monthly", "quarterly", "yearly"] as const;

function getStoredFramework(available: string[]): string | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && available.includes(stored)) return stored;
  return null;
}

export function Dashboard() {
  const config = getConfig();
  const stored = getStoredFramework(config.frameworks);
  const [framework, setFramework] = useState(stored ?? config.frameworks[0] ?? "soc2");
  const [showPicker, setShowPicker] = useState(stored === null);
  const { catalog, loading, error } = useCatalog(framework);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<EvidenceType | null>(null);
  const [frequencyFilter, setFrequencyFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const handleFrameworkChange = useCallback((value: string) => {
    setFramework(value);
    localStorage.setItem(STORAGE_KEY, value);
  }, []);

  const handlePickerSelect = useCallback((value: string) => {
    handleFrameworkChange(value);
    setShowPicker(false);
  }, [handleFrameworkChange]);

  const categories = useMemo(() => {
    if (!catalog) return [] as string[];
    const unique = new Set(
      catalog.entries.map((e) => e.category).filter((c): c is string => Boolean(c))
    );
    return Array.from(unique).sort();
  }, [catalog]);

  const filteredEntries = useMemo(() => {
    if (!catalog) return [];

    const query = search.toLowerCase().trim();

    return catalog.entries.filter((entry) => {
      if (typeFilter && entry.type !== typeFilter) return false;
      if (frequencyFilter && entry.frequency !== frequencyFilter) return false;
      if (categoryFilter && entry.category !== categoryFilter) return false;
      if (query) {
        const haystack =
          `${entry.name} ${entry.description} ${entry.control} ${entry.id}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [catalog, search, typeFilter, frequencyFilter, categoryFilter]);

  const stats = useMemo(() => {
    if (!catalog) return null;
    const entries = catalog.entries;
    const bySeverity: Record<string, number> = {};
    let optionalCount = 0;
    for (const e of entries) {
      if (e.optional) {
        optionalCount++;
      } else {
        bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1;
      }
    }
    return { total: entries.length, bySeverity, optionalCount };
  }, [catalog]);

  const hasActiveFilters = search || typeFilter || frequencyFilter || categoryFilter;

  return (
    <div className="space-y-4">
      <FrameworkPickerDialog
        open={showPicker}
        frameworks={config.frameworks}
        onSelect={handlePickerSelect}
      />

      {/* Header row: title + search + framework */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Manual Evidence</h2>
          <p className="text-muted-foreground text-sm">
            Compliance evidence collection
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search evidence..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <FrameworkSelector
            value={framework}
            onChange={handleFrameworkChange}
            frameworks={config.frameworks}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
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
                  setCategoryFilter(null);
                }}
              >
                Clear
              </button>
            </>
          )}
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Category:</span>
            {categories.map((c) => (
              <Badge
                key={c}
                variant={categoryFilter === c ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => setCategoryFilter(categoryFilter === c ? null : c)}
              >
                {c.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Stats bar */}
      {stats && (
        <p className="text-xs text-muted-foreground">
          {stats.total} entries
          {Object.entries(stats.bySeverity)
            .sort(([, a], [, b]) => b - a)
            .map(([severity, count]) => ` · ${count} ${severity}`)}
          {stats.optionalCount > 0 && ` · ${stats.optionalCount} optional`}
        </p>
      )}

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
