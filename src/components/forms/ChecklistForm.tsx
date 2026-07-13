import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ListChecks } from "lucide-react";
import type { CatalogEntry } from "@/types/catalog";

export interface ChecklistItemState {
  id: string;
  checked: boolean;
  notes: string;
}

interface ChecklistFormProps {
  entry: CatalogEntry;
  items: ChecklistItemState[];
  setItem: (id: string, patch: Partial<ChecklistItemState>) => void;
}

// ChecklistForm renders a multi-item user attestation. Conceptually it is a
// multi-point declaration — the user attests that each listed step has been
// performed. Required items are marked with a red asterisk; the rendered PDF
// flags them the same way (see ChecklistPdf).
export function ChecklistForm({ entry, items, setItem }: ChecklistFormProps) {
  const catalogItems = entry.items ?? [];

  if (catalogItems.length === 0) {
    return (
      <Alert>
        <ListChecks className="h-4 w-4" />
        <AlertDescription className="text-sm">
          This checklist has no items defined in the catalog.
        </AlertDescription>
      </Alert>
    );
  }

  const stateById = new Map(items.map((i) => [i.id, i]));

  return (
    <div className="space-y-3">
      <Alert>
        <ListChecks className="h-4 w-4" />
        <AlertDescription className="text-sm leading-relaxed">
          Tick each step you have completed. Optional notes are included in the
          downloaded PDF.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        {catalogItems.map((item) => {
          const state = stateById.get(item.id) ?? {
            id: item.id,
            checked: false,
            notes: "",
          };

          return (
            <div
              key={item.id}
              className="rounded-md border p-3 space-y-2"
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  id={`item-${item.id}`}
                  checked={state.checked}
                  onCheckedChange={(checked: boolean) =>
                    setItem(item.id, { checked })
                  }
                />
                <Label
                  htmlFor={`item-${item.id}`}
                  className="text-sm leading-relaxed cursor-pointer flex-1"
                >
                  {item.text}
                  {item.required ? (
                    <span className="text-red-500"> *</span>
                  ) : null}
                </Label>
              </div>
              <Input
                id={`item-${item.id}-notes`}
                aria-label={`Optional notes for: ${item.text}`}
                value={state.notes}
                onChange={(e) => setItem(item.id, { notes: e.target.value })}
                placeholder="Optional notes…"
                className="text-xs"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
