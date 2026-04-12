import { Shield } from "lucide-react";

export function Header() {
  return (
    <header className="flex h-14 items-center border-b px-6">
      <Shield className="h-5 w-5 text-primary" />
      <span className="ml-2 font-semibold">SigComply</span>
      <span className="ml-2 text-sm text-muted-foreground">Evidence Portal</span>
    </header>
  );
}
