import { Shield } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

export function Header() {
  return (
    <header className="flex h-14 items-center border-b px-6">
      <NavLink to="/" className="flex items-center">
        <Shield className="h-5 w-5 text-primary" />
        <span className="ml-2 font-semibold">SigComply</span>
        <span className="ml-2 text-sm text-muted-foreground">Evidence Portal</span>
      </NavLink>
      <nav className="ml-auto flex items-center gap-1 text-sm">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(
              "rounded-md px-3 py-1.5 transition-colors",
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )
          }
        >
          Attestations
        </NavLink>
        <NavLink
          to="/verify"
          className={({ isActive }) =>
            cn(
              "rounded-md px-3 py-1.5 transition-colors",
              isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )
          }
        >
          Verify
        </NavLink>
      </nav>
    </header>
  );
}
