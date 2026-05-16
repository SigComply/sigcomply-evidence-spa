import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { CatalogEntry } from "@/types/catalog";
import { currentPeriod, formatPeriodRange } from "@/lib/period";
import { computeUploadPath } from "@/lib/storage-path";
import { copyText } from "@/lib/clipboard";
import { getDeviceRecord } from "@/lib/device-memory";
import { getConfig } from "@/config/runtime";
import { format } from "date-fns";
import { ArrowRight, Check, Copy, PencilLine } from "lucide-react";
import { SeverityDot, TSCBadge, OptionalBadge } from "./StatusBadge";

function formatCategory(raw: string): string {
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
    <div className="space-y-6">
      {grouped.map((group) => (
        <section key={group.category}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label}
            <span className="ml-1.5 font-normal normal-case">
              ({group.entries.length})
            </span>
          </h3>
          <div className="divide-y overflow-hidden rounded-lg border bg-card">
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
  const [copied, setCopied] = useState(false);

  const uploadPath = computeUploadPath(
    getConfig().storage.prefix,
    framework,
    entry.id,
    period.key,
  );

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (await copyText(uploadPath)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="group relative flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4">
      {/* Stretched link: covers the whole row for navigation/middle-click,
          while the copy button (relative + higher z) stays clickable and
          is not nested inside the anchor (which would be invalid HTML). */}
      <Link
        to={`/evidence/${framework}/${entry.id}`}
        aria-label={`Open ${entry.name}`}
        className="absolute inset-0 z-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
      />

      {/* Name + badges */}
      <div className="pointer-events-none min-w-0 flex-1">
        <div className="flex items-center gap-2">
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
              <PencilLine className="h-2.5 w-2.5" />
              {device.uploadedAt ? "marked uploaded here" : "drafted here"}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="font-mono">{entry.control}</span>
          <span aria-hidden>·</span>
          <span className="capitalize">{entry.frequency}</span>
          <span aria-hidden>·</span>
          <span className="font-mono">{period.key}</span>
          <span className="hidden sm:inline" aria-hidden>
            ·
          </span>
          <span className="hidden sm:inline">
            {formatPeriodRange(period)}
          </span>
          {entry.grace_period && (
            <>
              <span aria-hidden>·</span>
              <span>{entry.grace_period} grace</span>
            </>
          )}
          {entry.temporal_rule === "retrospective" && (
            <>
              <span aria-hidden>·</span>
              <span>retrospective</span>
            </>
          )}
        </div>
      </div>

      {/* Right side */}
      <div className="z-[1] flex items-center gap-3 sm:gap-4">
        <SeverityDot
          severity={entry.severity}
          className="pointer-events-none w-16 sm:w-20"
        />
        <button
          type="button"
          onClick={handleCopy}
          title={`Copy upload path: ${uploadPath}`}
          aria-label="Copy upload path"
          className="relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
        <ArrowRight className="pointer-events-none h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </div>
  );
}
