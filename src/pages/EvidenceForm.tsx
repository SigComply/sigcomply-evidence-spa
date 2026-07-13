import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DeclarationForm } from "@/components/forms/DeclarationForm";
import { ChecklistForm } from "@/components/forms/ChecklistForm";
import { SeverityBadge } from "@/components/dashboard/StatusBadge";
import { useCatalog } from "@/hooks/useCatalog";
import { useEvidenceForm } from "@/hooks/useEvidenceForm";
import { currentPeriod, formatPeriodRange } from "@/lib/period";
import { computeUploadPath, EVIDENCE_PDF_FILENAME } from "@/lib/storage-path";
import { copyText } from "@/lib/clipboard";
import { getDeviceRecord, setUploadedAck } from "@/lib/device-memory";
import { getConfig } from "@/config/runtime";
import {
  ArrowLeft,
  Download,
  CheckCircle2,
  Pencil,
  Copy,
  Check,
  AlertCircle,
  CalendarClock,
  ShieldCheck,
} from "lucide-react";
import type { CatalogEntry } from "@/types/catalog";

// SPA-renderable types: a user-attestation form the SPA produces a PDF for.
// Other catalog types (e.g. document_upload) are external — the user supplies
// the PDF themselves and uploads it to the same storage path.
const SPA_RENDERABLE_TYPES = new Set(["declaration", "checklist"]);

export function EvidenceForm() {
  const { framework = "", evidenceId = "" } = useParams();
  const { catalog, loading, error } = useCatalog(framework);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
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
      <div className="mx-auto max-w-3xl space-y-4">
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

function BackButton() {
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 gap-1.5 text-muted-foreground"
      onClick={() => navigate("/")}
    >
      <ArrowLeft className="h-4 w-4" />
      Back to list
    </Button>
  );
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: "error" | "info";
  title: string;
  children: React.ReactNode;
}) {
  const isError = tone === "error";
  return (
    <div
      className={[
        "flex items-start gap-3 rounded-lg border p-4 text-sm",
        isError
          ? "border-destructive/30 bg-destructive/5"
          : "border-border bg-muted/40",
      ].join(" ")}
    >
      <AlertCircle
        className={[
          "mt-0.5 h-4 w-4 shrink-0",
          isError ? "text-destructive" : "text-muted-foreground",
        ].join(" ")}
      />
      <div>
        <p
          className={[
            "font-medium",
            isError ? "text-destructive" : "text-foreground",
          ].join(" ")}
        >
          {title}
        </p>
        <p className="mt-0.5 text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

// Section wraps one step of the guided flow with a number + title.
function Section({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-start gap-3 border-b px-5 py-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {step}
        </span>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// CopyField renders a monospace value with a one-click copy button. This is
// the heart of "keep the upload hop, but make it obvious".
function CopyField({
  value,
  label,
  note,
}: {
  value: string;
  label: string;
  note?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    if (await copyText(value)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCopy}
          className="shrink-0"
        >
          {copied ? (
            <>
              <Check className="mr-1.5 h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              Copied
            </>
          ) : (
            <>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy
            </>
          )}
        </Button>
      </div>
      {note && (
        <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>
      )}
    </div>
  );
}

// PathNote explains, honestly, what the displayed path is and isn't: the
// leading prefix is this deployment's config, the rest is the fixed CLI
// layout, and nothing about the bucket itself is known here.
function pathNote(prefix: string): React.ReactNode {
  return (
    <>
      Path <em>inside</em> your evidence bucket. The leading{" "}
      <code className="rounded bg-muted px-1 py-0.5 font-mono">{prefix}</code>{" "}
      segment is this deployment’s configured prefix; the rest is the fixed
      SigComply layout. The bucket, provider and credentials are never known
      to this page.
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
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        Path inside your evidence bucket
      </p>
      <code className="block break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">
        {`${entry.id}/${periodKey}/${EVIDENCE_PDF_FILENAME}`}
      </code>
      <p className="mt-1.5 text-xs text-muted-foreground">
        This deployment hides the full path because the prefix is
        site-specific. This is the fixed layout the CLI looks for; prepend
        whatever prefix your SigComply storage config uses.
      </p>
    </div>
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
    <div className="mx-auto max-w-3xl space-y-5">
      <BackButton />
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold">{entry.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {entry.description}
          </p>
        </div>
        <Callout tone="info" title="Uploaded directly to your storage">
          This evidence is a document you already have (export, scan,
          certificate). The SPA doesn’t generate it — produce the PDF
          yourself and upload it to the path below for period{" "}
          <span className="font-mono">{period.key}</span> (
          {formatPeriodRange(period)}).
        </Callout>
        {cfg.show_upload_path ? (
          <CopyField
            value={uploadPath}
            label="Path inside your evidence bucket"
            note={pathNote(cfg.prefix)}
          />
        ) : (
          <FixedLayoutOnly entry={entry} periodKey={period.key} />
        )}
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

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <BackButton />

      {/* Entry header */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">{entry.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {entry.description}
            </p>
          </div>
          <SeverityBadge severity={entry.severity} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {entry.control}
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">
            {entry.type}
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">
            {entry.frequency}
          </Badge>
          {entry.optional && (
            <Badge variant="outline" className="text-xs">
              Optional
            </Badge>
          )}
        </div>
      </div>

      {/* 1 — Period context */}
      <Section
        step={1}
        title="Period this evidence covers"
        description="The CLI evaluates the uploaded PDF against this window."
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono font-medium">{form.period.key}</span>
            <span className="text-muted-foreground">
              {formatPeriodRange(form.period)}
            </span>
          </div>
          {entry.grace_period && (
            <span className="text-xs text-muted-foreground">
              {entry.grace_period} grace period
            </span>
          )}
          {entry.temporal_rule === "retrospective" && (
            <span className="text-xs text-muted-foreground">
              retrospective — attests to the period just ended
            </span>
          )}
        </div>
      </Section>

      {/* 2 — Attestation */}
      <Section
        step={2}
        title={
          entry.type === "declaration"
            ? "Review and accept"
            : "Confirm each step"
        }
      >
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
          />
        )}
        {form.attempted && form.fieldErrors.attestation && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {form.fieldErrors.attestation}
          </p>
        )}
      </Section>

      {/* 3 — Sign-off */}
      <Section
        step={3}
        title="Sign-off"
        description="Recorded in the PDF and remembered on this device for next time."
      >
        <div className="max-w-sm space-y-2">
          <Label htmlFor="completed-by">Completed by</Label>
          <Input
            id="completed-by"
            value={form.completedBy}
            onChange={(e) => form.setCompletedBy(e.target.value)}
            placeholder="Jane Doe or jane@company.com"
            aria-invalid={
              form.attempted && Boolean(form.fieldErrors.completedBy)
            }
            aria-describedby={
              form.attempted && form.fieldErrors.completedBy
                ? "completed-by-error"
                : undefined
            }
          />
          {form.attempted && form.fieldErrors.completedBy && (
            <p
              id="completed-by-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {form.fieldErrors.completedBy}
            </p>
          )}
        </div>
      </Section>

      {/* 4 — Generate */}
      <Section
        step={4}
        title="Generate evidence.pdf"
        description="Renders in your browser and downloads — nothing is uploaded."
      >
        {error && (
          <p className="mb-3 text-sm text-destructive">{error}</p>
        )}
        <Button
          onClick={handleSubmit}
          size="lg"
          disabled={form.submitting}
          className="w-full sm:w-auto"
        >
          <Download className="mr-2 h-4 w-4" />
          {form.submitting ? "Generating PDF…" : "Download evidence.pdf"}
        </Button>
      </Section>
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
  const cfg = getConfig().storage;
  // Trim a trailing slash so the breadcrumb segment matches the normalized
  // path from computeUploadPath (which collapses "manual-evidence/" → one
  // segment). Keeps the visual chips and the copyable path in agreement.
  const prefixSegment = cfg.prefix.replace(/\/+$/, "");
  const parts = [prefixSegment, entry.id, period.key, EVIDENCE_PDF_FILENAME];

  const [acked, setAcked] = useState(
    Boolean(getDeviceRecord(framework, entry.id, period.key)?.uploadedAt),
  );
  function toggleAck() {
    const next = !acked;
    setAcked(next);
    setUploadedAck(framework, entry.id, period.key, next);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <BackButton />

      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">
              evidence.pdf downloaded
            </h2>
            <p className="text-sm text-muted-foreground">
              Almost there — upload it to your bucket and the CLI does the
              rest. It isn’t counted until it’s in your bucket.
            </p>
          </div>
        </div>
      </div>

      <ol className="space-y-3">
        <HandoffStep n={1} title="Find evidence.pdf in your downloads">
          Your browser just saved it as{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            {EVIDENCE_PDF_FILENAME}
          </code>
          . Rename it if you like — only the upload path below matters to the
          CLI.
        </HandoffStep>

        <HandoffStep
          n={2}
          title="Upload it inside your evidence bucket at this path"
        >
          {cfg.show_upload_path ? (
            <div className="mt-2 space-y-3">
              <CopyField
                value={uploadPath}
                label="Path inside your evidence bucket"
                note={pathNote(cfg.prefix)}
              />
              <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                {parts.map((p, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <code
                      className={[
                        "rounded px-1.5 py-0.5 font-mono",
                        i === 0
                          ? "bg-muted/60 italic"
                          : "bg-muted",
                      ].join(" ")}
                      title={
                        i === 0
                          ? "Configured prefix for this deployment — may differ for your setup"
                          : "Fixed SigComply layout the CLI looks for"
                      }
                    >
                      {p}
                    </code>
                    {i < parts.length - 1 && <span aria-hidden>/</span>}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-2">
              <FixedLayoutOnly entry={entry} periodKey={period.key} />
            </div>
          )}
        </HandoffStep>

        <HandoffStep
          n={3}
          title="The CLI picks it up on its next run"
          last
        >
          On the next <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">sigcomply check</code>{" "}
          the file is found at that path, hashed, and counted for period{" "}
          <span className="font-mono">{period.key}</span>. Nothing is sent
          from this page.
        </HandoffStep>
      </ol>

      {/* Local-only acknowledgement. Deliberately worded so it never reads
          as compliance status — the SPA cannot see the bucket. */}
      <div className="rounded-lg border border-dashed bg-muted/30 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={acked}
            onChange={toggleAck}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span className="text-sm">
            <span className="font-medium">
              I’ve uploaded this to my bucket
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Saves a reminder to <strong>this browser only</strong>. It is
              not proof of upload and not compliance status — the SigComply
              CLI and your bucket remain the source of truth.
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit &amp; re-download
        </Button>
        <Link to="/">
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            Back to list
          </Button>
        </Link>
        <Link to="/verify" className="ml-auto">
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
            Verify a signed envelope
          </Button>
        </Link>
      </div>
    </div>
  );
}

function HandoffStep({
  n,
  title,
  children,
  last,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <li className="relative rounded-lg border bg-card p-5">
      <div className="flex gap-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-muted text-sm font-semibold">
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          <div className="mt-1 text-sm text-muted-foreground">{children}</div>
        </div>
      </div>
      {!last && (
        <span
          aria-hidden
          className="absolute left-[2.6rem] top-[3.5rem] h-[calc(100%-2rem)] w-px bg-border"
        />
      )}
    </li>
  );
}
