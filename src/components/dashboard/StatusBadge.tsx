import { Badge } from "@/components/ui/badge";
import type { EvidenceType } from "@/types/catalog";

const typeColors: Record<EvidenceType, string> = {
  document_upload: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  checklist: "bg-purple-100 text-purple-800 hover:bg-purple-100",
  declaration: "bg-teal-100 text-teal-800 hover:bg-teal-100",
};

const typeLabels: Record<EvidenceType, string> = {
  document_upload: "Document Upload",
  checklist: "Checklist",
  declaration: "Declaration",
};

export function TypeBadge({ type }: { type: EvidenceType }) {
  return (
    <Badge variant="secondary" className={typeColors[type]}>
      {typeLabels[type]}
    </Badge>
  );
}

const severityColors: Record<string, string> = {
  high: "bg-red-100 text-red-800 hover:bg-red-100",
  medium: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  low: "bg-green-100 text-green-800 hover:bg-green-100",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge variant="secondary" className={severityColors[severity] ?? ""}>
      {severity}
    </Badge>
  );
}

const tscColors: Record<string, string> = {
  security: "bg-red-50 text-red-700 hover:bg-red-50",
  availability: "bg-blue-50 text-blue-700 hover:bg-blue-50",
  confidentiality: "bg-purple-50 text-purple-700 hover:bg-purple-50",
  privacy: "bg-pink-50 text-pink-700 hover:bg-pink-50",
};

export function TSCBadge({ tsc }: { tsc: string }) {
  return (
    <Badge variant="secondary" className={tscColors[tsc] ?? ""}>
      {tsc}
    </Badge>
  );
}

export function OptionalBadge() {
  return (
    <Badge variant="outline" className="text-xs">
      Optional
    </Badge>
  );
}