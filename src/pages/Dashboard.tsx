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

const STORAGE_KEY = "sigcomply:framework";

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
  const [frequencyFilter, setFrequencyFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const declarationEntries = useMemo(
    () => catalog?.entries.filter((e) => e.type === "declaration") ?? [],
    [catalog]
  );

  const handleFrameworkChange = useCallback((value: string) => {
    setFramework(value);
    localStorage.setItem(STORAGE_KEY, value);
  }, []);

  const handlePickerSelect = useCallback((value: string) => {
    handleFrameworkChange(value);
    setShowPicker(false);
  }, [handleFrameworkChange]);

  const categories = useMemo(() => {
    const unique = new Set(
      declarationEntries.map((e) => e.category).filter((c): c is string => Boolean(c))
    );
    return Array.from(unique).sort();
  }, [declarationEntries]);

  const filteredEntries = useMemo(() => {
    const query = search.toLowerCase().trim();

    return declarationEntries.filter((entry) => {
      if (frequencyFilter && entry.frequency !== frequencyFilter) return false;
      if (categoryFilter && entry.category !== categoryFilter) return false;
      if (query) {
        const haystack =
          `${entry.name} ${entry.description} ${entry.control} ${entry.id}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [declarationEntries, search, frequencyFilter, categoryFilter]);

  const stats = useMemo(() => {
    if (declarationEntries.length === 0) return null;
    const bySeverity: Record<string, number> = {};
    let optionalCount = 0;
    for (const e of declarationEntries) {
      if (e.optional) {
        optionalCount++;
      } else {
        bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1;
      }
    }
    return { total: declarationEntries.length, bySeverity, optionalCount };
  }, [declarationEntries]);

  const hasActiveFilters = search || frequencyFilter || categoryFilter;

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
          <h2 className="text-2xl font-bold tracking-tight">Declarations</h2>
          <p className="text-muted-foreground text-sm">
            Compliance declarations requiring user attestation
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
          {stats.total} declarations
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
              {filteredEntries.length} of {declarationEntries.length} declarations
            </p>
          )}

          <EvidenceList entries={filteredEntries} framework={framework} />

          {filteredEntries.length === 0 && catalog && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {declarationEntries.length === 0
                ? "No declaration-based controls in this framework."
                : "No declarations match your filters."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
