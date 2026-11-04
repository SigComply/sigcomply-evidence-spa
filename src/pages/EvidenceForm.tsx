import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DeclarationForm } from "@/components/forms/DeclarationForm";
import { ChecklistForm } from "@/components/forms/ChecklistForm";
import { INPUT_INVALID } from "@/components/forms/styles";
import { SeverityBadge, OptionalBadge } from "@/components/dashboard/StatusBadge";
import { PageHeader } from "@/components/common/PageHeader";
import { Callout } from "@/components/common/Callout";
import { CopyField } from "@/components/common/CopyField";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CARD,
  FOCUS_RING,
  INLINE_CODE,
  INPUT,
  SECTION_LABEL,
} from "@/components/common/styles";
import { useCatalog } from "@/hooks/useCatalog";
import { useEvidenceForm } from "@/hooks/useEvidenceForm";
import { currentPeriod, formatPeriodRange, type Period } from "@/lib/period";
import { computeUploadPath, EVIDENCE_PDF_FILENAME } from "@/lib/storage-path";
import { getDeviceRecord, setUploadedAck } from "@/lib/device-memory";
import { getConfig } from "@/config/runtime";
import { UPLOAD_WINDOW_TEXT } from "@/lib/evidence-form";
import { cn } from "@/lib/utils";
import { Download, CheckCircle2, Pencil } from "lucide-react";
import type { CatalogEntry } from "@/types/catalog";

// SPA-renderable types: a user-attestation form the SPA produces a PDF for.
// Other catalog types (e.g. document_upload) are external — the user supplies
// the PDF themselves and uploads it to the same storage path.
const SPA_RENDERABLE_TYPES = new Set(["declaration", "checklist"]);

const CARD_TITLE = "text-lg font-semibold text-white";

export function EvidenceForm() {
  const { framework = "", evidenceId = "" } = useParams();
  const { catalog, loading, error } = useCatalog(framework);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-5 w-28 bg-slate-800" />
        <Skeleton className="h-16 w-full max-w-xl bg-slate-800" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-72 w-full bg-slate-800 lg:col-span-2" />
          <Skeleton className="h-48 w-full bg-slate-800" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl space-y-4">
        <BackButton />
        <Callout tone="error" title="Could not load the catalog">
          {error}
        </Callout>
      </div>
    );
  }

  const entry = catalog?.entries.find((e) => e.id === evidenceId);

  if (!entry) {
    return (
      <div className="max-w-3xl space-y-4">
        <BackButton />
        <Callout tone="error" title="Evidence entry not found">
          No catalog entry “{evidenceId}” in {framework}. It may have been
          renamed — go back to the list and pick it again.
        </Callout>
      </div>
    );
  }

  if (!SPA_RENDERABLE_TYPES.has(entry.type)) {
    return <ExternalEvidence entry={entry} />;
  }

  return <EvidenceFormContent entry={entry} framework={framework} />;
}

// A button, not a link: it is an action back to the list, styled as the web
// app's text back link.
function BackButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate("/")}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded text-sm text-slate-400 transition-colors hover:text-white",
        FOCUS_RING,
      )}
    >
      <span aria-hidden>←</span>
      Back to list
    </button>
  );
}

// EntryChips is the metadata line under the entry's title.
function EntryChips({ entry }: { entry: CatalogEntry }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-400">
      <span className="rounded bg-slate-700 px-1.5 py-0.5 font-mono text-xs text-slate-300">
        {entry.control}
      </span>
      <span className="capitalize">{entry.type.replace(/_/g, " ")}</span>
      <span aria-hidden className="text-slate-600">
        ·
      </span>
      <span className="capitalize">{entry.frequency}</span>
      {entry.optional && <OptionalBadge />}
      <SeverityBadge severity={entry.severity} />
    </div>
  );
}

function EntryHeader({ entry }: { entry: CatalogEntry }) {
  return (
    <div className="space-y-3">
      <PageHeader title={entry.name} subtitle={entry.description} />
      <EntryChips entry={entry} />
    </div>
  );
}

const PATH_LABEL = "Path in your evidence storage";

// CalendarCaveat: the period segment matches the CLI only for its default
// calendar. The SPA can't see a project's fiscal_year or custom calendar.
function CalendarCaveat() {
  return (
    <>
      It assumes the default calendar. If your project uses a{" "}
      <code className={INLINE_CODE}>fiscal_year</code> or{" "}
      <code className={INLINE_CODE}>custom</code> calendar, run{" "}
      <code className={INLINE_CODE}>sigcomply evidence due --all</code> for the
      exact folder.
    </>
  );
}

// pathNote says where the path starts and when it is wrong: the prefix is
// this deployment's config, and the period assumes the default calendar.
function pathNote(prefix: string): React.ReactNode {
  return (
    <>
      This path starts at the root of your manual evidence storage (the{" "}
      <code className={INLINE_CODE}>manual.pdf</code> source in{" "}
      <code className={INLINE_CODE}>.sigcomply.yaml</code>). It assumes the
      prefix <code className={INLINE_CODE}>{prefix}</code> and the default
      calendar. If your project sets another{" "}
      <code className={INLINE_CODE}>prefix</code>, or a{" "}
      <code className={INLINE_CODE}>fiscal_year</code> or{" "}
      <code className={INLINE_CODE}>custom</code> calendar, run{" "}
      <code className={INLINE_CODE}>sigcomply evidence due --all</code> for the
      exact folder.
    </>
  );
}

// FixedLayoutOnly is shown when a deployment sets show_upload_path:false —
// the concrete prefix would be misleading, so only the provider-agnostic
// layout the CLI looks for is shown.
function FixedLayoutOnly({
  entry,
  periodKey,
}: {
  entry: CatalogEntry;
  periodKey: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-slate-300">{PATH_LABEL}</p>
      <code className="block rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-200 [overflow-wrap:anywhere]">
        {`${entry.id}/${periodKey}/${EVIDENCE_PDF_FILENAME}`}
      </code>
      <p className="mt-2 text-sm text-slate-400">
        Put the <code className={INLINE_CODE}>prefix</code> of your{" "}
        <code className={INLINE_CODE}>manual.pdf</code> source in front of this
        path. <CalendarCaveat />
      </p>
    </div>
  );
}

// UploadFolder shows where the file goes: the full path with a copy button,
// or only the fixed layout when the deployment hides its prefix.
function UploadFolder({
  entry,
  periodKey,
  uploadPath,
}: {
  entry: CatalogEntry;
  periodKey: string;
  uploadPath: string;
}) {
  const cfg = getConfig().storage;
  return cfg.show_upload_path ? (
    <CopyField value={uploadPath} label={PATH_LABEL} note={pathNote(cfg.prefix)} />
  ) : (
    <FixedLayoutOnly entry={entry} periodKey={periodKey} />
  );
}

// PeriodDetails is the aside: the period the PDF will name, when to upload,
// and the folder it goes to.
function PeriodDetails({
  entry,
  period,
  uploadPath,
}: {
  entry: CatalogEntry;
  period: Period;
  uploadPath: string;
}) {
  return (
    <section className={cn(CARD, "p-6")} aria-labelledby="period-heading">
      <h2 id="period-heading" className={SECTION_LABEL}>
        Period this evidence covers
      </h2>
      <p className="mt-2 font-mono text-2xl font-semibold text-white">
        {period.key}
      </p>
      <p className="mt-1 text-sm text-slate-300">{formatPeriodRange(period)}</p>
      <p className="mt-3 text-sm text-slate-400">{UPLOAD_WINDOW_TEXT}</p>
      <div className="mt-5 border-t border-slate-700 pt-5">
        <UploadFolder entry={entry} periodKey={period.key} uploadPath={uploadPath} />
      </div>
    </section>
  );
}

// ExternalEvidence handles entries the SPA does not render a form for (e.g.
// document_upload — normally filtered out at catalog build time, but reachable
// by direct URL). Instead of a dead-end sentence, show exactly where the file
// goes so the user can still act.
function ExternalEvidence({ entry }: { entry: CatalogEntry }) {
  const period = currentPeriod(entry.frequency);
  const cfg = getConfig().storage;
  const uploadPath = computeUploadPath(cfg.prefix, entry.id, period.key);
  return (
    <div className="max-w-3xl space-y-6">
      <BackButton />
      <EntryHeader entry={entry} />
      <Callout tone="info" title="Uploaded directly to your storage">
        This entry is a document you already have, such as an export, scan or
        certificate. There’s no form for it: upload the file to the folder below
        for period <span className="font-mono">{period.key}</span> (
        {formatPeriodRange(period)}).
      </Callout>
      <div className={cn(CARD, "p-6")}>
        <UploadFolder entry={entry} periodKey={period.key} uploadPath={uploadPath} />
      </div>
    </div>
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

  async function handleSubmit() {
    setError(null);
    const err = await form.submit();
    if (err) setError(err);
  }

  if (form.downloadSuccess) {
    return (
      <UploadHandoff
        entry={entry}
        framework={framework}
        period={form.period}
        uploadPath={form.uploadPath}
        onEdit={() => form.setDownloadSuccess(false)}
      />
    );
  }

  const completedByError = form.attempted ? form.fieldErrors.completedBy : undefined;

  return (
    <div className="space-y-6">
      <BackButton />
      <EntryHeader entry={entry} />

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 space-y-6 lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <section className={cn(CARD, "p-6")} aria-labelledby="attestation-heading">
            <h2 id="attestation-heading" className={cn(CARD_TITLE, "mb-4")}>
              {entry.type === "declaration" ? "Review and accept" : "Confirm each step"}
            </h2>
            {entry.type === "declaration" ? (
              <DeclarationForm
                entry={entry}
                accepted={form.accepted}
                setAccepted={form.setAccepted}
              />
            ) : (
              <ChecklistForm
                entry={entry}
                items={form.items}
                setItem={form.setItem}
                noteErrors={form.attempted ? form.fieldErrors.notes : undefined}
              />
            )}
            {form.attempted && form.fieldErrors.attestation && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {form.fieldErrors.attestation}
              </p>
            )}
          </section>

          <section className={cn(CARD, "p-6")} aria-labelledby="signoff-heading">
            <h2 id="signoff-heading" className={CARD_TITLE}>
              Sign-off
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Recorded in the PDF and remembered on this device for next time.
            </p>
            <div className="mt-4 max-w-sm space-y-2">
              <Label htmlFor="completed-by" className="text-slate-300">
                Completed by
              </Label>
              <Input
                id="completed-by"
                value={form.completedBy}
                onChange={(e) => form.setCompletedBy(e.target.value)}
                placeholder="Jane Doe or jane@company.com"
                className={cn(INPUT, INPUT_INVALID)}
                aria-invalid={Boolean(completedByError)}
                aria-describedby={completedByError ? "completed-by-error" : undefined}
              />
              {completedByError && (
                <p id="completed-by-error" role="alert" className="text-sm text-destructive">
                  {completedByError}
                </p>
              )}
            </div>

            <div className="mt-6 border-t border-slate-700 pt-6">
              {/* A validation problem is announced next to its field only;
                  this line is for what has no field, such as a render failure. */}
              {error && (
                <p role="alert" className="mb-3 text-sm text-destructive">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={form.submitting}
                className={cn(BUTTON_PRIMARY, "w-full px-6 py-3 text-base sm:w-auto")}
              >
                <Download aria-hidden />
                {form.submitting ? "Generating PDF…" : "Download evidence.pdf"}
              </button>
              <p className="mt-3 text-sm text-slate-400">
                Renders in your browser and downloads. Nothing is uploaded.
              </p>
            </div>
          </section>
        </div>

        {/* After the form, so a phone reaches the task first; from lg it
            sits in the right column and stays in view while scrolling. */}
        <aside
          className="min-w-0 lg:sticky lg:top-6 lg:col-start-3 lg:row-start-1"
          aria-label="Details"
        >
          <PeriodDetails entry={entry} period={form.period} uploadPath={form.uploadPath} />
        </aside>
      </div>
    </div>
  );
}

// UploadHandoff is the post-download screen — the moment the user has the
// file and must move it to their bucket. Make that unmissable.
function UploadHandoff({
  entry,
  framework,
  period,
  uploadPath,
  onEdit,
}: {
  entry: CatalogEntry;
  framework: string;
  period: { key: string };
  uploadPath: string;
  onEdit: () => void;
}) {
  const [acked, setAcked] = useState(
    Boolean(getDeviceRecord(framework, entry.id, period.key)?.uploadedAt),
  );
  function toggleAck() {
    const next = !acked;
    setAcked(next);
    setUploadedAck(framework, entry.id, period.key, next);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <BackButton />

      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20"
        >
          <CheckCircle2 className="size-5 text-emerald-400" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            evidence.pdf downloaded
          </h1>
          <p className="mt-1 text-slate-400">
            Upload it to the folder below. The CLI can’t see it until you do.
          </p>
        </div>
      </div>

      <ol className={cn(CARD, "divide-y divide-slate-700")}>
        <HandoffStep n={1} title="Find evidence.pdf in your downloads">
          Your browser saved it as{" "}
          <code className={INLINE_CODE}>{EVIDENCE_PDF_FILENAME}</code>, or a
          numbered name such as{" "}
          <code className={INLINE_CODE}>evidence (1).pdf</code>.
        </HandoffStep>

        <HandoffStep n={2} title="Upload it to this folder in your evidence storage">
          <div className="mt-3">
            <UploadFolder entry={entry} periodKey={period.key} uploadPath={uploadPath} />
          </div>
          <p className="mt-3">
            Any file name works, but the CLI merges every file in the folder
            into one PDF: if you’re replacing an earlier copy, delete it.
          </p>
        </HandoffStep>

        <HandoffStep n={3} title="The CLI picks it up on the next scheduled run">
          Your scheduled CI run,{" "}
          <code className={INLINE_CODE}>sigcomply check --scheduled</code>{" "}
          (daily by default), checks the folder and signs a record of the file
          for period <span className="font-mono">{period.key}</span>.{" "}
          {UPLOAD_WINDOW_TEXT}
        </HandoffStep>
      </ol>

      {/* Local-only acknowledgement. Deliberately worded so it never reads
          as compliance status — the SPA cannot see the bucket. */}
      <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={acked}
            onChange={toggleAck}
            className={cn(
              // An outline, not FOCUS_RING's box-shadow: WebKit paints no
              // shadow on a native checkbox.
              "mt-0.5 size-5 shrink-0 cursor-pointer rounded accent-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
            )}
          />
          <span className="text-sm">
            <span className="font-medium text-slate-100">
              I’ve uploaded this to my evidence storage
            </span>
            <span className="mt-0.5 block text-slate-400">
              Saved in <strong className="text-slate-300">this browser only</strong>,
              as a reminder. It doesn’t check your evidence storage.
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onEdit} className={BUTTON_SECONDARY}>
          <Pencil aria-hidden />
          Edit &amp; re-download
        </button>
        <Link
          to="/"
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:text-white",
            FOCUS_RING,
          )}
        >
          Back to list
        </Link>
      </div>
    </div>
  );
}

function HandoffStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4 p-5 sm:p-6">
      <span
        aria-hidden
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-white">{title}</h2>
        <div className="mt-1 text-sm text-slate-400">{children}</div>
      </div>
    </li>
  );
}
