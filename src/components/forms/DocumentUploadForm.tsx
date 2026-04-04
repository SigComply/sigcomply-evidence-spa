import type { CatalogEntry } from "@/types/catalog";
import { Upload } from "lucide-react";

interface DocumentUploadFormProps {
  entry: CatalogEntry;
}

export function DocumentUploadForm({ entry }: DocumentUploadFormProps) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
      <Upload className="h-5 w-5 mt-0.5 shrink-0" />
      <div className="space-y-1">
        <p>
          After downloading <code className="text-xs bg-muted px-1 py-0.5 rounded">evidence.json</code>,
          upload it to your storage folder along with your supporting documents.
        </p>
        {entry.accepted_formats && entry.accepted_formats.length > 0 && (
          <p className="text-xs">
            Accepted formats: {entry.accepted_formats.map((f) => `.${f}`).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
