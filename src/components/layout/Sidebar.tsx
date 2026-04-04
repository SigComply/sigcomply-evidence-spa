import { Link, useLocation } from "react-router-dom";
import { Shield, FileText, ChevronsLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
}

export function Sidebar({ open, onToggle }: SidebarProps) {
  const location = useLocation();

  const isActive = (path: string) =>
    location.pathname === path;

  if (!open) return null;

  return (
    <aside className="hidden md:flex w-60 flex-col border-r bg-sidebar shrink-0">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-semibold">SigComply</span>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onToggle}>
          <ChevronsLeft className="h-4 w-4" />
        </Button>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        <Link
          to="/"
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
            isActive("/")
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-sidebar-foreground hover:bg-sidebar-accent/50"
          }`}
        >
          <FileText className="h-4 w-4" />
          Manual Evidence
        </Link>
      </nav>
      <div className="border-t p-4 text-xs text-muted-foreground">
        Evidence Collection Portal
      </div>
    </aside>
  );
}
