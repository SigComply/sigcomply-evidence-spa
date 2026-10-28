import { GUIDE_LINKS } from "@/lib/guide-links";

export function Footer() {
  return (
    <footer className="mt-10 border-t pt-4 text-xs text-muted-foreground">
      <nav aria-label="Guides" className="flex flex-wrap gap-x-5 gap-y-1">
        {GUIDE_LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {l.label}
          </a>
        ))}
      </nav>
    </footer>
  );
}
