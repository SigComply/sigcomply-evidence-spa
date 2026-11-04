import { useEffect } from "react";

export const SITE_TITLE = "SigComply Evidence";

// Every route shares index.html's <title>; naming the page keeps browser tabs
// and history entries distinguishable when several forms are open.
export function useDocumentTitle(page?: string) {
  useEffect(() => {
    document.title = page ? `${page} · ${SITE_TITLE}` : SITE_TITLE;
  }, [page]);
}
