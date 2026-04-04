import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Link to="/" className={buttonVariants()}>
        Back to Dashboard
      </Link>
    </div>
  );
}
