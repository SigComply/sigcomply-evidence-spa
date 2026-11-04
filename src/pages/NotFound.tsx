import { Link } from "react-router-dom";
import { CARD, BUTTON_PRIMARY } from "@/components/common/styles";

export function NotFound() {
  return (
    <div className={`${CARD} mx-auto max-w-xl px-6 py-16 text-center`}>
      <p className="font-mono text-sm text-slate-400">404</p>
      <h1 className="mt-2 text-2xl font-bold text-white">Page not found</h1>
      <p className="mx-auto mt-2 mb-6 max-w-sm text-slate-400">
        This address doesn’t match a page in the evidence tools.
      </p>
      <Link to="/" className={BUTTON_PRIMARY}>
        Back to list
      </Link>
    </div>
  );
}
