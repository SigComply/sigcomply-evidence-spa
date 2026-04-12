import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentUploadForm } from "@/components/forms/DocumentUploadForm";
import { ChecklistForm } from "@/components/forms/ChecklistForm";
import { DeclarationForm } from "@/components/forms/DeclarationForm";
import { useCatalog } from "@/hooks/useCatalog";
import { useEvidenceForm } from "@/hooks/useEvidenceForm";
import { ArrowLeft, Download, CheckCircle2, Upload, Pencil } from "lucide-react";
import type { CatalogEntry } from "@/types/catalog";

export function EvidenceForm() {
  const { framework = "", evidenceId = "" } = useParams();
  const { catalog, loading, error } = useCatalog(framework);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <BackButton />
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  const entry = catalog?.entries.find((e) => e.id === evidenceId);

  if (!entry) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <BackButton />
        <p className="text-sm text-muted-foreground py-8 text-center">
          Evidence entry not found.
        </p>
      </div>
    );
  }

  return <EvidenceFormContent entry={entry} framework={framework} />;
}

function BackButton() {
  const navigate = useNavigate();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 -ml-2 text-muted-foreground"
      onClick={() => navigate("/")}
    >
      <ArrowLeft className="h-4 w-4" />
      Back to list
    </Button>
  );
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
      <div className="mx-auto max-w-2xl space-y-6">
        <BackButton />

        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 shrink-0">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="space-y-4 flex-1 min-w-0">
              <div>
                <h2 className="text-lg font-semibold">evidence.json downloaded</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload it to your storage at:
                </p>
              </div>

              <code className="block text-sm bg-muted rounded-md px-3 py-2.5 break-all font-mono">
                {form.uploadPath}
              </code>

              {entry.type === "document_upload" && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Upload className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>Place your supporting documents in the same folder.</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" size="sm" onClick={() => form.setDownloadSuccess(false)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit & re-download
                </Button>
                <Link to="/">
                  <Button variant="ghost" size="sm" className="text-muted-foreground">
                    Back to list
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackButton />

      {/* Entry header */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold">{entry.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">{entry.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-xs">
            {entry.control}
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">
            {entry.frequency}
          </Badge>
          <Badge variant="outline" className="text-xs font-mono">
            {form.period.key}
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">
            {entry.severity}
          </Badge>
        </div>
      </div>

      {/* Form content */}
      <div className="rounded-lg border bg-card p-6 space-y-6">
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

        <div className="flex justify-end pt-2">
          <Button onClick={handleSubmit} size="lg">
            <Download className="mr-2 h-4 w-4" />
            Download evidence.json
          </Button>
        </div>
      </div>
    </div>
  );
}
