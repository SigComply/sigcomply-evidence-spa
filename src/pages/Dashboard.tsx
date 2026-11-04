import { useState, useMemo, useCallback } from "react";
import { FrameworkSelector } from "@/components/dashboard/FrameworkSelector";
import { FrameworkPickerDialog } from "@/components/dashboard/FrameworkPickerDialog";
import { PeriodOverview } from "@/components/dashboard/PeriodOverview";
import { EvidenceList } from "@/components/dashboard/EvidenceList";
import { HowItWorks } from "@/components/dashboard/HowItWorks";
import { useCatalog } from "@/hooks/useCatalog";
import { getConfig } from "@/config/runtime";
import { readPref, writePref } from "@/lib/local-prefs";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/common/PageHeader";
import { Callout } from "@/components/common/Callout";
import {
  BUTTON_SECONDARY,
  CARD,
  FOCUS_RING,
  INPUT,
  SECTION_LABEL,
} from "@/components/common/styles";
import { Search, X, FileText } from "lucide-react";

const STORAGE_KEY = "sigcomply:framework";

// FilterChip is a real toggle button (keyboard-operable, state announced via
// aria-pressed), so filtering works for keyboard and screen-reader users.
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
      className={cn(
        "inline-flex h-8 cursor-pointer items-center rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors",
        FOCUS_RING,
        active
          ? "border-indigo-600 bg-indigo-600 text-white"
          : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500",
        className,
      )}
    >
      {children}
    </button>
  );
}

const SEVERITY_ORDER = ["high", "medium", "low"];

// Catalog types the SPA renders as a clickable form. Other types
// (e.g. document_upload) are uploaded directly by the customer and are
// hidden from this dashboard.
const SPA_RENDERABLE_TYPES = new Set(["declaration", "checklist"]);

function getStoredFramework(available: string[]): string | null {
  const stored = readPref(STORAGE_KEY);
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

  const clearAll = useCallback(() => {
    setSearch("");
    setFrequencyFilter(null);
    setCategoryFilter(null);
    setSeverityFilter(null);
    setRequiredOnly(false);
  }, []);

  // A search or chip from one framework rarely means anything in another,
  // so switching starts with no filters.
  const handleFrameworkChange = useCallback(
    (value: string) => {
      if (value !== framework) clearAll();
      setFramework(value);
      writePref(STORAGE_KEY, value);
    },
    [clearAll, framework],
  );

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
    // Only enum labels are capitalised; a search chip shows the query as typed.
    const f: { label: string; enumLabel: boolean; clear: () => void }[] = [];
    if (search)
      f.push({ label: `“${search}”`, enumLabel: false, clear: () => setSearch("") });
    if (frequencyFilter)
      f.push({
        label: frequencyFilter,
        enumLabel: true,
        clear: () => setFrequencyFilter(null),
      });
    if (severityFilter)
      f.push({
        label: severityFilter,
        enumLabel: true,
        clear: () => setSeverityFilter(null),
      });
    if (categoryFilter)
      f.push({
        label: categoryFilter.replace(/_/g, " "),
        enumLabel: true,
        clear: () => setCategoryFilter(null),
      });
    if (requiredOnly)
      f.push({ label: "required only", enumLabel: true, clear: () => setRequiredOnly(false) });
    return f;
  }, [
    search,
    frequencyFilter,
    severityFilter,
    categoryFilter,
    requiredOnly,
  ]);

  // Offer "Required only" only when it can change the list.
  const hasOptional = attestations.some((e) => e.optional);
  const hasRequired = attestations.some((e) => !e.optional);

  const ready = !loading && !error && attestations.length > 0;

  return (
    <div className="space-y-6">
      <FrameworkPickerDialog
        open={showPicker}
        frameworks={config.frameworks}
        onSelect={handlePickerSelect}
        onDismiss={handlePickerDismiss}
      />

      <PageHeader
        title="User attestations"
        subtitle="Declarations and checklists that need a person to sign off."
        actions={
          <FrameworkSelector
            value={framework}
            onChange={handleFrameworkChange}
            frameworks={config.frameworks}
          />
        }
      />

      <HowItWorks />

      {ready && (
        <PeriodOverview
          entries={attestations}
          activeFrequency={frequencyFilter}
          onSelectFrequency={setFrequencyFilter}
        />
      )}

      {/* Filter bar */}
      {ready && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-auto sm:min-w-[16rem] sm:flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
              />
              <Input
                aria-label="Search attestations by name, control, or ID"
                placeholder="Search by name, control, or ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(INPUT, "pl-9")}
              />
            </div>

            {severities.length > 1 &&
              severities.map((s) => (
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

            {hasOptional && hasRequired && (
              <FilterChip
                active={requiredOnly}
                onToggle={() => setRequiredOnly((v) => !v)}
              >
                Required only
              </FilterChip>
            )}
          </div>

          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(SECTION_LABEL, "mr-1")}>Category</span>
              {categories.map((c) => (
                <FilterChip
                  key={c}
                  active={categoryFilter === c}
                  onToggle={() =>
                    setCategoryFilter(categoryFilter === c ? null : c)
                  }
                  className="capitalize"
                >
                  {c.replace(/_/g, " ")}
                </FilterChip>
              ))}
            </div>
          )}

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-400">
                {filteredEntries.length} of {attestations.length} ·
              </span>
              {activeFilters.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  aria-label={`Remove filter ${f.label}`}
                  onClick={f.clear}
                  className={cn(
                    "inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full bg-slate-700 px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-600 hover:text-white",
                    FOCUS_RING,
                  )}
                >
                  <span className={cn("truncate", f.enumLabel && "capitalize")}>
                    {f.label}
                  </span>
                  <X className="size-3 shrink-0" aria-hidden />
                </button>
              ))}
              <button
                type="button"
                onClick={clearAll}
                className={cn(
                  "cursor-pointer rounded text-sm text-slate-400 underline underline-offset-2 hover:text-white",
                  FOCUS_RING,
                )}
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="space-y-3" aria-hidden>
          <Skeleton className="h-40 w-full rounded-xl bg-slate-800" />
          <Skeleton className="h-9 w-full rounded-lg bg-slate-800" />
          <Skeleton className="h-64 w-full rounded-xl bg-slate-800" />
        </div>
      )}

      {error && (
        <Callout tone="error" title={`Could not load the ${framework} catalog`}>
          {error}
        </Callout>
      )}

      {!loading && !error && (
        <>
          {/* Gives the group and empty-state h3s a parent, so they don't
              read as part of the periods card. */}
          <h2 className="sr-only">Attestations</h2>
          <EvidenceList entries={filteredEntries} framework={framework} />

          {filteredEntries.length === 0 && (
            <div className={cn(CARD, "px-6 py-16 text-center")}>
              <FileText className="mx-auto size-10 text-slate-500" aria-hidden />
              {attestations.length === 0 ? (
                <h3 className="mt-4 text-lg font-medium text-white">
                  This framework has no declarations or checklists.
                </h3>
              ) : (
                <>
                  <h3 className="mt-4 text-lg font-medium text-white">
                    No attestations match your filters.
                  </h3>
                  <button
                    type="button"
                    onClick={clearAll}
                    className={cn(BUTTON_SECONDARY, "mt-6")}
                  >
                    Clear all filters
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
