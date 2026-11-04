import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { CatalogEntry } from "@/types/catalog";
import { currentPeriod, formatPeriodRange } from "@/lib/period";
import { computeUploadPath } from "@/lib/storage-path";
import { copyText } from "@/lib/clipboard";
import { getDeviceRecord } from "@/lib/device-memory";
import { getConfig } from "@/config/runtime";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  ChevronRight,
  Check,
  Copy,
  PencilLine,
  FileText,
  ListChecks,
} from "lucide-react";
import { CARD, FOCUS_RING, SECTION_LABEL } from "@/components/common/styles";
import { Pill } from "@/components/common/Pill";
import { SeverityBadge, TSCBadge, OptionalBadge } from "./StatusBadge";

function formatCategory(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const META_DOT = (
  <span aria-hidden className="text-slate-600">
    ·
  </span>
);

interface EvidenceListProps {
  entries: CatalogEntry[];
  framework: string;
}

export function EvidenceList({ entries, framework }: EvidenceListProps) {
  const grouped = useMemo(() => {
    const groups: Record<string, CatalogEntry[]> = {};
    for (const entry of entries) {
      const cat = entry.category ?? "";
      (groups[cat] ??= []).push(entry);
    }
    return Object.entries(groups)
      // Entries without a category go last, under "Other".
      .sort(([a], [b]) => (!a ? 1 : !b ? -1 : a.localeCompare(b)))
      .map(([category, items]) => ({
        category,
        label: category ? formatCategory(category) : "Other",
        entries: items.sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [entries]);

  if (entries.length === 0) return null;
  // One group needs no heading (today's catalogs carry no categories, which
  // put every entry under a lone "Uncategorized").
  const showHeadings = grouped.length > 1;

  return (
    <div className="space-y-6">
      {grouped.map((group) => (
        <section key={group.category}>
          {showHeadings && (
            <div className="mb-2 flex items-center gap-2">
              <h3 className={SECTION_LABEL}>{group.label}</h3>
              <span className="text-xs font-medium text-slate-400">
                {group.entries.length}
              </span>
            </div>
          )}
          <div className={cn(CARD, "divide-y divide-slate-700 overflow-hidden")}>
            {group.entries.map((entry) => (
              <EvidenceRow
                key={entry.id}
                entry={entry}
                framework={framework}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EvidenceRow({
  entry,
  framework,
}: {
  entry: CatalogEntry;
  framework: string;
}) {
  const period = currentPeriod(entry.frequency);
  const device = getDeviceRecord(framework, entry.id, period.key);
  const cfg = getConfig().storage;
  const [copied, setCopied] = useState(false);

  const uploadPath = computeUploadPath(cfg.prefix, entry.id, period.key);

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (await copyText(uploadPath)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  const TypeIcon = entry.type === "checklist" ? ListChecks : FileText;

  return (
    <div
      data-testid="evidence-row"
      className="group relative flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-900/30"
    >
      {/* Stretched link: whole-row navigation + middle-click, kept out of
          the anchor so the copy button is valid + independently clickable. */}
      <Link
        to={`/evidence/${framework}/${entry.id}`}
        aria-label={`Open ${entry.name}`}
        className={cn("absolute inset-0 z-0 focus-visible:ring-inset", FOCUS_RING)}
      />

      <div className="pointer-events-none flex min-w-0 flex-1 items-start gap-3">
        <span className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-slate-900/50 text-slate-400 sm:flex">
          <TypeIcon className="size-4" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium break-words text-white">{entry.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-slate-400">
            <span className="rounded bg-slate-700 px-1.5 py-0.5 font-mono text-xs text-slate-300">
              {entry.control}
            </span>
            {META_DOT}
            <span className="capitalize">{entry.frequency}</span>
            {META_DOT}
            {/* The range is in the periods card; here it is a tooltip so
                every row doesn't repeat it. */}
            <span className="font-mono" title={formatPeriodRange(period)}>
              {period.key}
            </span>
            {entry.tsc && <TSCBadge tsc={entry.tsc} />}
            {entry.optional && <OptionalBadge />}
            {device?.generatedAt && (
              <span
                title={
                  "Drafted in this browser on " +
                  format(new Date(device.generatedAt), "PP p") +
                  (device.uploadedAt
                    ? `; marked uploaded on ${format(new Date(device.uploadedAt), "PP")}`
                    : "") +
                  ". Saved on this device only. It doesn’t show what’s in your storage."
                }
                // Above the stretched link so its tooltip shows on hover.
                className="pointer-events-auto relative z-[1]"
              >
                <Pill tone="indigo">
                  <PencilLine aria-hidden />
                  {device.uploadedAt ? "marked uploaded here" : "drafted here"}
                </Pill>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span className="pointer-events-none mr-1">
          <SeverityBadge severity={entry.severity} />
        </span>
        {cfg.show_upload_path && (
          <button
            type="button"
            onClick={handleCopy}
            title={`Copy ${uploadPath}`}
            aria-label={`Copy upload path for ${entry.name}`}
            className={cn(
              "relative z-[1] flex size-8 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-700 hover:text-white",
              FOCUS_RING,
            )}
          >
            {copied ? (
              <Check className="size-4 text-emerald-400" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
          </button>
        )}
        <ChevronRight
          aria-hidden
          className="pointer-events-none size-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-300"
        />
      </div>
    </div>
  );
}
