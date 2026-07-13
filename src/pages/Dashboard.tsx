import { useState, useMemo, useCallback } from "react";
import { FrameworkSelector } from "@/components/dashboard/FrameworkSelector";
import { FrameworkPickerDialog } from "@/components/dashboard/FrameworkPickerDialog";
import { PeriodOverview } from "@/components/dashboard/PeriodOverview";
import { EvidenceList } from "@/components/dashboard/EvidenceList";
import { useCatalog } from "@/hooks/useCatalog";
import { getConfig } from "@/config/runtime";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, X, FileText, AlertCircle } from "lucide-react";

const STORAGE_KEY = "sigcomply:framework";

// FilterChip is a real toggle button (keyboard-operable, state announced via
// aria-pressed) wrapping the visual Badge. A bare Badge is a <span> — not
// focusable and invisible to assistive tech — so filtering the list would be
// unavailable to keyboard and screen-reader users.
function FilterChip({
  active,
  onToggle,
  className,
  children,
}: {
  active: boolean;
  onToggle: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Badge
        variant={active ? "default" : "outline"}
        className={["cursor-pointer", className].filter(Boolean).join(" ")}
      >
        {children}
      </Badge>
    </button>
  );
}

const SEVERITY_ORDER = ["high", "medium", "low"];

// Catalog types the SPA renders as a clickable form. Other types
// (e.g. document_upload) are uploaded directly by the customer and are
// hidden from this dashboard.
const SPA_RENDERABLE_TYPES = new Set(["declaration", "checklist"]);

function getStoredFramework(available: string[]): string | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && available.includes(stored)) return stored;
  return null;
}

export function Dashboard() {
  const config = getConfig();
  const stored = getStoredFramework(config.frameworks);
  const [framework, setFramework] = useState(
    stored ?? config.frameworks[0] ?? "soc2",
  );
  // Only prompt when there's a genuine choice to make. With a single
  // configured framework the picker is pure friction, and it must never
  // block the app — Verify is framework-agnostic and reachable from here.
  const [showPicker, setShowPicker] = useState(
    stored === null && config.frameworks.length > 1,
  );
  const { catalog, loading, error } = useCatalog(framework);

  const [search, setSearch] = useState("");
  const [frequencyFilter, setFrequencyFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [requiredOnly, setRequiredOnly] = useState(false);

  const attestations = useMemo(
    () => catalog?.entries.filter((e) => SPA_RENDERABLE_TYPES.has(e.type)) ?? [],
    [catalog],
  );

  const handleFrameworkChange = useCallback((value: string) => {
    setFramework(value);
    localStorage.setItem(STORAGE_KEY, value);
  }, []);

  const handlePickerSelect = useCallback(
    (value: string) => {
      handleFrameworkChange(value);
      setShowPicker(false);
    },
    [handleFrameworkChange],
  );

  // Dismissing (Esc / backdrop / close) keeps the current default and
  // persists it so the prompt doesn't nag — it never traps the user.
  const handlePickerDismiss = useCallback(() => {
    handleFrameworkChange(framework);
    setShowPicker(false);
  }, [handleFrameworkChange, framework]);

  const categories = useMemo(() => {
    const unique = new Set(
      attestations.map((e) => e.category).filter((c): c is string => Boolean(c)),
    );
    return Array.from(unique).sort();
  }, [attestations]);

  const severities = useMemo(() => {
    const present = new Set(attestations.map((e) => e.severity));
    return SEVERITY_ORDER.filter((s) => present.has(s));
  }, [attestations]);

  const filteredEntries = useMemo(() => {
    const query = search.toLowerCase().trim();
    return attestations.filter((entry) => {
      if (frequencyFilter && entry.frequency !== frequencyFilter) return false;
      if (categoryFilter && entry.category !== categoryFilter) return false;
      if (severityFilter && entry.severity !== severityFilter) return false;
      if (requiredOnly && entry.optional) return false;
      if (query) {
        const haystack =
          `${entry.name} ${entry.description} ${entry.control} ${entry.id}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [
    attestations,
    search,
    frequencyFilter,
    categoryFilter,
    severityFilter,
    requiredOnly,
  ]);

  const activeFilters = useMemo(() => {
    const f: { label: string; clear: () => void }[] = [];
    if (search)
      f.push({ label: `“${search}”`, clear: () => setSearch("") });
    if (frequencyFilter)
      f.push({
        label: frequencyFilter,
        clear: () => setFrequencyFilter(null),
      });
    if (severityFilter)
      f.push({
        label: severityFilter,
        clear: () => setSeverityFilter(null),
      });
    if (categoryFilter)
      f.push({
        label: categoryFilter.replace(/_/g, " "),
        clear: () => setCategoryFilter(null),
      });
    if (requiredOnly)
      f.push({ label: "required only", clear: () => setRequiredOnly(false) });
    return f;
  }, [
    search,
    frequencyFilter,
    severityFilter,
    categoryFilter,
    requiredOnly,
  ]);

  const clearAll = useCallback(() => {
    setSearch("");
    setFrequencyFilter(null);
    setCategoryFilter(null);
    setSeverityFilter(null);
    setRequiredOnly(false);
  }, []);

  return (
    <div className="space-y-6">
      <FrameworkPickerDialog
        open={showPicker}
        frameworks={config.frameworks}
        onSelect={handlePickerSelect}
        onDismiss={handlePickerDismiss}
      />

      {/* Title + framework */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            User attestations
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Declarations and checklists that need a person to sign off. Fill
            one in to generate an{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              evidence.pdf
            </code>{" "}
            you upload to your own storage — nothing is sent anywhere.
          </p>
        </div>
        <FrameworkSelector
          value={framework}
          onChange={handleFrameworkChange}
          frameworks={config.frameworks}
        />
      </div>

      {!loading && !error && attestations.length > 0 && (
        <PeriodOverview
          entries={attestations}
          activeFrequency={frequencyFilter}
          onSelectFrequency={setFrequencyFilter}
        />
      )}

      {/* Filter bar */}
      {!loading && !error && attestations.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[16rem] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search attestations by name, control, or ID"
                placeholder="Search by name, control, or ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {severities.map((s) => (
              <FilterChip
                key={s}
                active={severityFilter === s}
                onToggle={() =>
                  setSeverityFilter(severityFilter === s ? null : s)
                }
                className="capitalize"
              >
                {s}
              </FilterChip>
            ))}

            <FilterChip
              active={requiredOnly}
              onToggle={() => setRequiredOnly((v) => !v)}
            >
              Required only
            </FilterChip>
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">
                Category
              </span>
              {categories.map((c) => (
                <FilterChip
                  key={c}
                  active={categoryFilter === c}
                  onToggle={() =>
                    setCategoryFilter(categoryFilter === c ? null : c)
                  }
                  className="text-xs"
                >
                  {c.replace(/_/g, " ")}
                </FilterChip>
              ))}
            </div>
          )}

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">
                {filteredEntries.length} of {attestations.length} ·
              </span>
              {activeFilters.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  aria-label={`Remove filter ${f.label}`}
                  onClick={f.clear}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {f.label}
                  <X className="h-3 w-3" />
                </button>
              ))}
              <button
                type="button"
                onClick={clearAll}
                className="rounded text-xs text-muted-foreground underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">
              Could not load the {framework} catalog
            </p>
            <p className="mt-0.5 text-muted-foreground">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && !error && (
        <>
          <EvidenceList entries={filteredEntries} framework={framework} />

          {filteredEntries.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/60" />
              {attestations.length === 0 ? (
                <div className="max-w-sm space-y-1">
                  <p className="text-sm font-medium">
                    No user attestations in this framework
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Document-style evidence (HR exports, scans, certificates)
                    is uploaded straight to your storage bucket — it never
                    appears here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    No attestations match your filters.
                  </p>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="rounded text-xs text-muted-foreground underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
