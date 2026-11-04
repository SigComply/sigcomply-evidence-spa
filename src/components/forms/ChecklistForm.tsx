import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { INPUT } from "@/components/common/styles";
import { CHECKBOX, INPUT_INVALID } from "@/components/forms/styles";
import { cn } from "@/lib/utils";
import type { CatalogEntry } from "@/types/catalog";
import type { ChecklistItemState } from "@/lib/evidence-form";

interface ChecklistFormProps {
  entry: CatalogEntry;
  items: ChecklistItemState[];
  setItem: (id: string, patch: Partial<ChecklistItemState>) => void;
  /** Per item id, shown under that item's note once the user has submitted. */
  noteErrors?: Record<string, string>;
}

// ChecklistForm renders a multi-item user attestation. Conceptually it is a
// multi-point declaration — the user attests that each listed step has been
// performed. Required items are marked with a red asterisk; the rendered PDF
// flags them the same way (see ChecklistPdf).
export function ChecklistForm({ entry, items, setItem, noteErrors }: ChecklistFormProps) {
  const catalogItems = entry.items ?? [];

  if (catalogItems.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        This checklist has no items defined in the catalog.
      </p>
    );
  }

  const stateById = new Map(items.map((i) => [i.id, i]));
  const ticked = catalogItems.filter((item) => stateById.get(item.id)?.checked).length;

  return (
    <div>
      <p className="text-sm text-slate-400">
        Tick each step you have completed. Optional notes are included in the
        downloaded PDF.
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-slate-300">
          {ticked} of {catalogItems.length} ticked
        </span>
        <span className="text-slate-400">
          <span className="text-red-400">*</span> required
        </span>
      </div>

      <ul className="mt-3 divide-y divide-slate-700 border-y border-slate-700">
        {catalogItems.map((item) => {
          const state = stateById.get(item.id) ?? {
            id: item.id,
            checked: false,
            notes: "",
          };

          const noteError = noteErrors?.[item.id];
          const noteErrorId = `item-${item.id}-notes-error`;
          return (
            <li key={item.id} className="py-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id={`item-${item.id}`}
                  checked={state.checked}
                  onCheckedChange={(checked: boolean) =>
                    setItem(item.id, { checked })
                  }
                  className={CHECKBOX}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <Label
                    htmlFor={`item-${item.id}`}
                    className="block cursor-pointer leading-relaxed break-words text-slate-100"
                  >
                    {item.text}
                    {item.required ? (
                      <span className="text-red-400"> *</span>
                    ) : null}
                  </Label>
                  <Input
                    id={`item-${item.id}-notes`}
                    aria-label={`Optional notes for: ${item.text}`}
                    value={state.notes}
                    onChange={(e) => setItem(item.id, { notes: e.target.value })}
                    placeholder="Optional notes…"
                    className={cn(INPUT, INPUT_INVALID, "h-8")}
                    aria-invalid={Boolean(noteError)}
                    aria-describedby={noteError ? noteErrorId : undefined}
                  />
                  {noteError && (
                    <p id={noteErrorId} role="alert" className="text-sm text-destructive">
                      {noteError}
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
