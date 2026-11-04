import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "@/lib/clipboard";

// CopyField shows a value in a code box with a Copy button of the same
// height beside it.
export function CopyField({
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
      <p className="mb-1.5 text-sm font-medium text-slate-300">{label}</p>
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-200 [overflow-wrap:anywhere] select-all">
          {value}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-700 px-3 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          {copied ? (
            <>
              <Check className="size-4 text-emerald-400" aria-hidden />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden />
              Copy
            </>
          )}
        </button>
      </div>
      {note && <p className="mt-2 text-sm text-slate-400">{note}</p>}
    </div>
  );
}
