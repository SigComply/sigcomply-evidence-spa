import { cn } from "@/lib/utils";
import { CARD, INLINE_CODE } from "@/components/common/styles";
import { GUIDE_LINKS } from "@/lib/guide-links";

const STEPS: { title: React.ReactNode; body: string }[] = [
  {
    title: "Fill in a form",
    body: "Pick a declaration or checklist below and complete it.",
  },
  {
    title: (
      <>
        Download <code className={INLINE_CODE}>evidence.pdf</code>
      </>
    ),
    body: "It renders in your browser. Nothing is sent anywhere.",
  },
  {
    title: "Upload it to its folder",
    body:
      "Put it in your evidence storage. The SigComply CLI picks it up on its next scheduled run (daily by default).",
  },
];

// The three steps up front, then the exceptions (evidence with no form, the
// CLI command that lists empty folders, Verify) in one quieter paragraph.
export function HowItWorks() {
  return (
    <div className="space-y-3">
      <section className={cn(CARD, "p-5")} aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="text-base font-semibold text-white">
          How it works
        </h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={i} className="flex gap-3 rounded-lg bg-slate-900/50 p-4">
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white"
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-white">{step.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <p className="text-sm text-slate-400">
        Other manual evidence, such as training certificates and HR exports, has
        no form. Upload those files to your evidence storage yourself. To see
        which folders are still empty, read{" "}
        <a
          href={GUIDE_LINKS[0].href}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded text-indigo-400 underline underline-offset-2 hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          the manual evidence guide
        </a>{" "}
        or run <code className={INLINE_CODE}>sigcomply evidence due --all</code>.
        The command also gives the right folder for a custom prefix or
        calendar. Auditors can check a signed evidence file in{" "}
        <span className="font-medium text-slate-200">Verify</span>.
      </p>
    </div>
  );
}
