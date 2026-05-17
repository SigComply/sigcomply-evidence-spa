import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { severityBadgeClass, tscBadgeClass } from "@/lib/severity";

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn("capitalize", severityBadgeClass(severity))}
    >
      {severity}
    </Badge>
  );
}

export function TSCBadge({ tsc }: { tsc: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn("capitalize", tscBadgeClass(tsc))}
    >
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
