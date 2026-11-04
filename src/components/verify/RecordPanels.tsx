import { CheckCircle2 } from "lucide-react";
import { Pill, type PillTone } from "@/components/common/Pill";
import { SECTION_LABEL } from "@/components/common/styles";
import type {
  ManualDocumentPayload,
  ManualInstancePayload,
} from "@/types/envelope";
import {
  memberLabel,
  memberVerdict,
  recordedChecks,
  type MemberVerdict,
} from "@/lib/verification/manual";
import { severityTone } from "@/lib/severity";

const VERDICT_PILL: Record<MemberVerdict, { text: string; tone: PillTone }> = {
  satisfied: { text: "satisfied", tone: "emerald" },
  exempt: { text: "exempt", tone: "slate" },
  missing: { text: "no evidence", tone: "red" },
  failed: { text: "failed", tone: "red" },
};

const CHECK_PILL = {
  yes: { text: "yes", tone: "emerald" },
  no: { text: "no", tone: "red" },
  unknown: { text: "not checked", tone: "slate" },
} as const;

export function RecordedPanel({ record }: { record: ManualDocumentPayload }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-white">
          What the CLI recorded
        </h2>
        <p className="mt-0.5 text-sm text-slate-400">
          The CLI signed these results when it checked the folder. This page
          doesn&apos;t re-check it.
        </p>
      </div>
      <ul className="divide-y divide-slate-700">
        {recordedChecks(record).map((c) => {
          const b =
            CHECK_PILL[c.ok === undefined ? "unknown" : c.ok ? "yes" : "no"];
          // The pill stays the label's next sibling: tests read the verdict
          // that way.
          return (
            <li
              key={c.label}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <span className="text-slate-300">{c.label}</span>
              <Pill tone={b.tone}>{b.text}</Pill>
            </li>
          );
        })}
      </ul>
      {record.validation_failures?.map((f) => (
        <p key={f} className="text-sm text-red-400">
          {f}
        </p>
      ))}
      {record.source_files && record.source_files.length > 0 && (
        <div>
          <p className={SECTION_LABEL}>Files in the folder</p>
          <ul className="mt-2 space-y-1 text-sm">
            {record.source_files.map((f) => (
              <li key={`${f.filename}-${f.sha256}`} className="break-all">
                <span className="font-mono text-slate-200">{f.filename}</span>
                <span className="text-slate-400">
                  {" "}
                  · {f.type}
                  {f.uploaded_at ? ` · uploaded ${f.uploaded_at}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function MembersPanel({
  members,
  total,
  satisfied,
  matchedId,
}: {
  members: ManualInstancePayload[];
  total: number;
  satisfied: number;
  matchedId?: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-white">
          {satisfied} of {total} members satisfied
        </h2>
        <p className="mt-0.5 text-sm text-slate-400">
          Each member has its own folder. The CLI signed these results, and
          this page doesn&apos;t re-check the folders.
        </p>
      </div>
      <ul className="divide-y divide-slate-700">
        {members.map((m) => {
          const v = VERDICT_PILL[memberVerdict(m)];
          return (
            <li key={m.id} className="space-y-1 py-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-100">
                  {memberLabel(m)}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {m.id === matchedId && (
                    <Pill tone="emerald">
                      <CheckCircle2 aria-hidden />
                      PDF matches
                    </Pill>
                  )}
                  {m.tier && (
                    <Pill tone={severityTone(m.tier)} className="capitalize">
                      {m.tier}
                    </Pill>
                  )}
                  <Pill tone={v.tone}>{v.text}</Pill>
                </span>
              </div>
              {m.exemption_reason && (
                <p className="text-slate-400">
                  Exempt: {m.exemption_reason}
                  {m.approved_by ? ` (approved by ${m.approved_by})` : ""}
                </p>
              )}
              {m.validation_failures?.map((f) => (
                <p key={f} className="text-red-400">
                  {f}
                </p>
              ))}
              {m.file_hash && (
                <p className="text-xs break-all text-slate-400">
                  <span>Merged PDF SHA-256</span>{" "}
                  <span className="font-mono">{m.file_hash}</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
