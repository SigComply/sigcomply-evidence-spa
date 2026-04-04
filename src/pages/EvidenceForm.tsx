import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentUploadForm } from "@/components/forms/DocumentUploadForm";
import { ChecklistForm } from "@/components/forms/ChecklistForm";
import { DeclarationForm } from "@/components/forms/DeclarationForm";
import { useCatalog } from "@/hooks/useCatalog";
import { useEvidenceForm } from "@/hooks/useEvidenceForm";
import { ArrowLeft, Download, CheckCircle2, Upload } from "lucide-react";
import type { CatalogEntry } from "@/types/catalog";

export function EvidenceForm() {
  const { framework = "", evidenceId = "" } = useParams();
  const { catalog, loading, error } = useCatalog(framework);

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl space-y-4">
        <Link to="/" className="text-sm text-muted-foreground hover:underline flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  const entry = catalog?.entries.find((e) => e.id === evidenceId);

  if (!entry) {
    return (
      <div className="max-w-2xl space-y-4">
        <Link to="/" className="text-sm text-muted-foreground hover:underline flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <p>Evidence entry not found.</p>
      </div>
    );
  }

  return <EvidenceFormContent entry={entry} framework={framework} />;
}

function EvidenceFormContent({
  entry,
  framework,
}: {
  entry: CatalogEntry;
  framework: string;
}) {
  const form = useEvidenceForm(entry, framework);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    const err = form.submit();
    if (err) setError(err);
  }

  if (form.downloadSuccess) {
    return (
      <div className="max-w-2xl space-y-6">
        <Link to="/" className="text-sm text-muted-foreground hover:underline flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="flex items-start gap-3 py-8">
          <CheckCircle2 className="h-6 w-6 text-green-600 mt-0.5 shrink-0" />
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">evidence.json downloaded</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Upload it to your storage at:
              </p>
            </div>

            <code className="block text-sm bg-muted rounded-md px-3 py-2 break-all">
              {form.uploadPath}
            </code>

            {entry.type === "document_upload" && (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Upload className="h-4 w-4 mt-0.5 shrink-0" />
                <p>Place your supporting documents in the same folder.</p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => form.setDownloadSuccess(false)}>
                Edit & re-download
              </Button>
              <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:underline">
                Back to list
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Link to="/" className="text-sm text-muted-foreground hover:underline flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div>
        <h2 className="text-xl font-semibold">{entry.name}</h2>
        <p className="text-sm text-muted-foreground mt-1">{entry.description}</p>
        <div className="flex gap-4 text-xs text-muted-foreground mt-3">
          <span>Control: {entry.control}</span>
          <span className="capitalize">{entry.frequency}</span>
          <span>Period: {form.period.key}</span>
          <span className="capitalize">Severity: {entry.severity}</span>
        </div>
      </div>

      <Separator />

      {entry.type === "document_upload" && (
        <DocumentUploadForm entry={entry} />
      )}

      {entry.type === "checklist" && (
        <ChecklistForm
          entry={entry}
          checklistItems={form.checklistItems}
          setChecklistItem={form.setChecklistItem}
          setChecklistNotes={form.setChecklistNotes}
        />
      )}

      {entry.type === "declaration" && (
        <DeclarationForm
          entry={entry}
          accepted={form.accepted}
          setAccepted={form.setAccepted}
        />
      )}

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="completed-by">Completed by</Label>
        <Input
          id="completed-by"
          value={form.completedBy}
          onChange={(e) => form.setCompletedBy(e.target.value)}
          placeholder="jane@company.com"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button onClick={handleSubmit} className="w-full">
        <Download className="mr-2 h-4 w-4" />
        Download evidence.json
      </Button>
    </div>
  );
}
