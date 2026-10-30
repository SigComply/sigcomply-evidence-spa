import type { Catalog } from "@/types/catalog";
import { getConfig } from "@/config/runtime";
import { FRAMEWORK_PATTERN, validateCatalog } from "@/lib/catalog-validate";
import { fetchStatic } from "@/lib/static-fetch";

const catalogCache = new Map<string, Catalog>();

// `framework` comes from the URL (/evidence/:framework/...), so it is checked
// against config.json's list before it becomes part of a path.
export async function fetchCatalog(framework: string): Promise<Catalog> {
  const cached = catalogCache.get(framework);
  if (cached) return cached;

  if (!FRAMEWORK_PATTERN.test(framework) || !getConfig().frameworks.includes(framework)) {
    throw new Error(`Unknown framework ${JSON.stringify(framework)}`);
  }
  const resp = await fetchStatic(`data/catalogs/${encodeURIComponent(framework)}.json`);
  if (!resp.ok) {
    throw new Error(`Failed to load catalog for ${framework}`);
  }

  const { catalog, errors } = validateCatalog(await resp.json(), framework);
  if (!catalog) {
    throw new Error(`Invalid catalog for ${framework}: ${errors.join("; ")}`);
  }
  catalogCache.set(framework, catalog);
  return catalog;
}
