import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CHECKBOX } from "@/components/forms/styles";
import type { CatalogEntry } from "@/types/catalog";

interface DeclarationFormProps {
  entry: CatalogEntry;
  accepted: boolean;
  setAccepted: (accepted: boolean) => void;
  /** Set once a submit failed because the box is unticked: the error's id. */
  errorId?: string;
}

export function DeclarationForm({
  entry,
  accepted,
  setAccepted,
  errorId,
}: DeclarationFormProps) {
  return (
    <div className="space-y-5">
      <blockquote className="rounded-lg border-l-2 border-indigo-500 bg-slate-900/50 p-4 leading-relaxed break-words text-slate-200">
        {entry.declaration_text}
      </blockquote>

      <div className="flex items-start gap-3">
        <Checkbox
          id="accept-declaration"
          checked={accepted}
          onCheckedChange={(checked: boolean) => setAccepted(checked)}
          className={CHECKBOX}
          aria-invalid={Boolean(errorId)}
          aria-describedby={errorId}
        />
        <Label
          htmlFor="accept-declaration"
          className="block cursor-pointer leading-relaxed text-slate-100"
        >
          I accept this declaration <span className="text-red-400">*</span>
        </Label>
      </div>
    </div>
  );
}
