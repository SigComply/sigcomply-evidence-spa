import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { CatalogEntry } from "@/types/catalog";

interface ChecklistFormProps {
  entry: CatalogEntry;
  checklistItems: Record<string, { checked: boolean; notes: string }>;
  setChecklistItem: (id: string, checked: boolean) => void;
  setChecklistNotes: (id: string, notes: string) => void;
}

export function ChecklistForm({
  entry,
  checklistItems,
  setChecklistItem,
  setChecklistNotes,
}: ChecklistFormProps) {
  if (!entry.items) return null;

  return (
    <div className="space-y-4">
      {entry.items.map((item) => {
        const state = checklistItems[item.id];
        return (
          <div key={item.id} className="space-y-2 rounded-md border p-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id={item.id}
                checked={state?.checked ?? false}
                onCheckedChange={(checked: boolean) =>
                  setChecklistItem(item.id, checked)
                }
              />
              <Label htmlFor={item.id} className="text-sm leading-relaxed cursor-pointer">
                {item.text}
                {item.required && <span className="text-red-500 ml-1">*</span>}
              </Label>
            </div>
            <Textarea
              placeholder="Notes (optional)"
              value={state?.notes ?? ""}
              onChange={(e) => setChecklistNotes(item.id, e.target.value)}
              className="text-sm"
              rows={2}
            />
          </div>
        );
      })}
    </div>
  );
}
