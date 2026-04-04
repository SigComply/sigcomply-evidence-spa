import { Button } from "@/components/ui/button";
import { PanelLeft } from "lucide-react";

interface HeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function Header({ sidebarOpen, onToggleSidebar }: HeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2">
        {!sidebarOpen && (
          <Button variant="ghost" size="icon-sm" onClick={onToggleSidebar}>
            <PanelLeft className="h-4 w-4" />
          </Button>
        )}
        <h1 className="text-lg font-semibold">SigComply Evidence</h1>
      </div>
    </header>
  );
}
