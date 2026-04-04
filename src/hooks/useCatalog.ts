import { useState, useEffect } from "react";
import { fetchCatalog } from "@/data";
import type { Catalog } from "@/types/catalog";

export function useCatalog(framework: string) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCatalog(framework)
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      setCatalog(null);
      setLoading(true);
      setError(null);
    };
  }, [framework]);

  return { catalog, loading, error };
}
