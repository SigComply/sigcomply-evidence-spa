import { GUIDE_LINKS } from "@/lib/guide-links";

const LINK = "transition-colors hover:text-white";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-800">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>
          Source-available under the{" "}
          <a
            href="https://github.com/SigComply/sigcomply-evidence-spa/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className={`underline underline-offset-2 ${LINK}`}
          >
            Elastic License 2.0
          </a>
          .
        </p>
        <nav aria-label="Guides" className="flex flex-wrap gap-x-6 gap-y-1">
          {GUIDE_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
