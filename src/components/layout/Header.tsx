import { ShieldCheck } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    isActive
      ? "bg-muted text-foreground"
      : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
  );

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center px-4 sm:px-6">
        <NavLink to="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="font-semibold tracking-tight">SigComply</span>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            Evidence Portal
          </span>
        </NavLink>
        <nav className="ml-auto flex items-center gap-1">
          <NavLink to="/" end className={navLinkClass}>
            Attestations
          </NavLink>
          <NavLink to="/verify" className={navLinkClass}>
            Verify
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
