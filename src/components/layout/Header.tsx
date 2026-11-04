import { Link, NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/common/Logo";
import { FOCUS_RING } from "@/components/common/styles";

const navItemClass = (active: boolean) =>
  cn(
    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    FOCUS_RING,
    active
      ? "bg-slate-800 text-white"
      : "text-slate-400 hover:bg-slate-800/50 hover:text-white",
  );

export function Header() {
  // A form page belongs to the attestation list it was opened from.
  const { pathname } = useLocation();
  const onAttestations = pathname === "/" || pathname.startsWith("/evidence/");

  return (
    <header className="border-b border-slate-800">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className={cn("flex items-center gap-2 rounded-lg", FOCUS_RING)}>
          <LogoMark />
          <span className="text-lg font-semibold text-white">SigComply</span>
          <span className="hidden text-sm text-slate-400 sm:inline">
            Evidence tools
          </span>
        </Link>
        <nav aria-label="Main" className="ml-auto flex items-center gap-1">
          <Link
            to="/"
            aria-current={onAttestations ? "page" : undefined}
            className={navItemClass(onAttestations)}
          >
            Attestations
          </Link>
          <NavLink to="/verify" className={({ isActive }) => navItemClass(isActive)}>
            Verify
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
