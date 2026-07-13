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
import { TSCBadge, OptionalBadge } from "./StatusBadge";
import { severityRailClass } from "@/lib/severity";

function formatCategory(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const META_DOT = (
  <span aria-hidden className="text-muted-foreground/40">
    •
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
      const cat = entry.category ?? "uncategorized";
      (groups[cat] ??= []).push(entry);
    }
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
    <div className="space-y-7">
      {grouped.map((group) => (
        <section key={group.category}>
          <div className="mb-2.5 flex items-center gap-3">
            <h3 className="text-sm font-semibold tracking-tight">
              {group.label}
            </h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {group.entries.length}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
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
    <div className="group relative flex items-stretch transition-colors hover:bg-muted/40">
      {/* Severity accent rail — the primary at-a-glance cue. The severity
          word is still in the meta line so this never relies on colour. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          severityRailClass(entry.severity),
        )}
      />

      {/* Stretched link: whole-row navigation + middle-click, kept out of
          the anchor so the copy button is valid + independently clickable. */}
      <Link
        to={`/evidence/${framework}/${entry.id}`}
        aria-label={`Open ${entry.name}`}
        className="absolute inset-0 z-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      />

      <div className="pointer-events-none flex min-w-0 flex-1 items-start gap-3.5 py-3.5 pl-4 pr-3 sm:items-center">
        {/* Type glyph */}
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground sm:mt-0">
          <TypeIcon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-medium">{entry.name}</span>
            {entry.tsc && <TSCBadge tsc={entry.tsc} />}
            {entry.optional && <OptionalBadge />}
            {device?.generatedAt && (
              <span
                title={
                  "Drafted in this browser on " +
                  format(new Date(device.generatedAt), "PP p") +
                  (device.uploadedAt
                    ? `; you marked it uploaded on ${format(new Date(device.uploadedAt), "PP")}`
                    : "") +
                  ". Personal note on this device only — not proof of upload and not compliance status. The CLI is the source of truth."
                }
                className="pointer-events-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                <PencilLine className="size-2.5" />
                {device.uploadedAt ? "marked uploaded here" : "drafted here"}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-mono">{entry.control}</span>
            {META_DOT}
            <span className="capitalize">{entry.frequency}</span>
            {META_DOT}
            <span className="font-mono">{period.key}</span>
            <span className="hidden items-center gap-x-2 sm:flex">
              {META_DOT}
              <span>{formatPeriodRange(period)}</span>
            </span>
            {entry.grace_period && (
              <>
                {META_DOT}
                <span>{entry.grace_period} grace</span>
              </>
            )}
            {entry.temporal_rule === "retrospective" && (
              <>
                {META_DOT}
                <span>retrospective</span>
              </>
            )}
            {META_DOT}
            <span className="capitalize">{entry.severity}</span>
          </div>
        </div>
      </div>

      {/* Right actions */}
      <div className="z-[1] flex shrink-0 items-center gap-1 pr-3">
        {cfg.show_upload_path && (
          <button
            type="button"
            onClick={handleCopy}
            title={`Copy the path inside your evidence bucket — ${uploadPath}. The leading "${cfg.prefix}" segment comes from this deployment's config; the rest is the fixed SigComply layout. The bucket, provider and credentials are never known here.`}
            aria-label="Copy path inside your evidence bucket"
            className="relative flex size-8 items-center justify-center rounded-md text-muted-foreground opacity-100 transition-all hover:bg-muted hover:text-foreground focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          >
            {copied ? (
              <Check className="size-4 text-green-600 dark:text-green-400" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        )}
        <ChevronRight className="pointer-events-none size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
      </div>
    </div>
  );
}
