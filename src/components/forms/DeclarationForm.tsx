import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText } from "lucide-react";
import type { CatalogEntry } from "@/types/catalog";

interface DeclarationFormProps {
  entry: CatalogEntry;
  accepted: boolean;
  setAccepted: (accepted: boolean) => void;
}

export function DeclarationForm({
  entry,
  accepted,
  setAccepted,
}: DeclarationFormProps) {
  return (
    <div className="space-y-4">
      <Alert>
        <FileText className="h-4 w-4" />
        <AlertDescription className="text-sm leading-relaxed">
          {entry.declaration_text}
        </AlertDescription>
      </Alert>

      <div className="flex items-start gap-3 rounded-md border p-4">
        <Checkbox
          id="accept-declaration"
          checked={accepted}
          onCheckedChange={(checked: boolean) => setAccepted(checked)}
        />
        <Label
          htmlFor="accept-declaration"
          className="text-sm leading-relaxed cursor-pointer"
        >
          I accept this declaration <span className="text-red-500">*</span>
        </Label>
      </div>
    </div>
  );
}
