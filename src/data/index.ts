import type { Catalog } from "@/types/catalog";

const catalogCache = new Map<string, Catalog>();

export async function fetchCatalog(framework: string): Promise<Catalog> {
  const cached = catalogCache.get(framework);
  if (cached) return cached;

  const resp = await fetch(`${import.meta.env.BASE_URL}data/catalogs/${framework}.json`);
  if (!resp.ok) {
    throw new Error(`Failed to load catalog for ${framework}`);
  }

  const catalog = (await resp.json()) as Catalog;
  catalogCache.set(framework, catalog);
  return catalog;
}
