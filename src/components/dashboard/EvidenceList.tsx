import { Link } from "react-router-dom";
import type { CatalogEntry, EvidenceType } from "@/types/catalog";
import { currentPeriod } from "@/lib/period";
import { ArrowRight } from "lucide-react";

const typeDotColors: Record<EvidenceType, string> = {
  document_upload: "bg-blue-500",
  checklist: "bg-purple-500",
  declaration: "bg-teal-500",
};

const typeLabels: Record<EvidenceType, string> = {
  document_upload: "Upload",
  checklist: "Checklist",
  declaration: "Declaration",
};

interface EvidenceListProps {
  entries: CatalogEntry[];
  framework: string;
}

export function EvidenceList({ entries, framework }: EvidenceListProps) {
  if (entries.length === 0) return null;

  return (
    <div className="border rounded-lg divide-y">
      {/* Column headers */}
      <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground font-medium bg-muted/30">
        <span className="w-2.5" />
        <span className="flex-1">Name</span>
        <span className="hidden sm:block w-16 text-right">Control</span>
        <span className="hidden md:block w-16">Type</span>
        <span className="hidden md:block w-20">Frequency</span>
        <span className="hidden lg:block w-20">Period</span>
        <span className="hidden lg:block w-14">Severity</span>
        <span className="w-4" />
      </div>
      {entries.map((entry) => (
        <EvidenceRow key={entry.id} entry={entry} framework={framework} />
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
      <span
        className={`h-2 w-2 rounded-full shrink-0 ${typeDotColors[entry.type]}`}
        title={typeLabels[entry.type]}
      />

      <span className="flex-1 min-w-0 text-sm truncate">
        {entry.name}
      </span>

      <span className="hidden sm:block w-16 text-right text-xs text-muted-foreground">
        {entry.control}
      </span>
      <span className="hidden md:block w-16 text-xs text-muted-foreground">
        {typeLabels[entry.type]}
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
