import type { RuntimeConfig } from "@/types/config";

let cachedConfig: RuntimeConfig | null = null;

// The built-in fallback used when config.json is missing, unreachable, or
// malformed. Mirrors public/config.json so the app always has a sane default
// and never renders a blank page over a config hiccup.
const DEFAULT_CONFIG: RuntimeConfig = {
  frameworks: ["soc2"],
  storage: { show_upload_path: true, prefix: "manual-evidence" },
};

// normalizeConfig coerces arbitrary parsed JSON into a valid RuntimeConfig,
// falling back field-by-field to the default. A valid-JSON-but-wrong-shape
// config.json (e.g. missing `storage`, empty `frameworks`) must not crash the
// app at render time — every consumer can rely on the shape being complete.
function normalizeConfig(raw: unknown): RuntimeConfig {
  const obj = (raw ?? {}) as Record<string, unknown>;

  const frameworks = Array.isArray(obj.frameworks)
    ? obj.frameworks.filter((f): f is string => typeof f === "string")
    : [];

  const storageRaw = (obj.storage ?? {}) as Record<string, unknown>;

  return {
    frameworks: frameworks.length > 0 ? frameworks : DEFAULT_CONFIG.frameworks,
    storage: {
      show_upload_path:
        typeof storageRaw.show_upload_path === "boolean"
          ? storageRaw.show_upload_path
          : DEFAULT_CONFIG.storage.show_upload_path,
      prefix:
        typeof storageRaw.prefix === "string"
          ? storageRaw.prefix
          : DEFAULT_CONFIG.storage.prefix,
    },
  };
}

export async function loadConfig(): Promise<RuntimeConfig> {
  if (cachedConfig) return cachedConfig;

  // BASE_URL carries the deploy sub-path (e.g. "/sigcomply-evidence-spa/" on
  // GitHub Pages, "/" locally) and always has a trailing slash. Fetching an
  // absolute "/config.json" would 404 on a sub-path deploy and silently drop
  // any deployment override — resolve it relative to the base instead, exactly
  // as catalogs are fetched (src/data/index.ts).
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}config.json`);
    if (!resp.ok) {
      cachedConfig = DEFAULT_CONFIG;
      return cachedConfig;
    }
    cachedConfig = normalizeConfig(await resp.json());
  } catch {
    // Network failure or invalid JSON — fall back rather than reject, so
    // main.tsx can still mount the app.
    cachedConfig = DEFAULT_CONFIG;
  }
  return cachedConfig;
}

export function getConfig(): RuntimeConfig {
  if (!cachedConfig) {
    throw new Error("Config not loaded. Call loadConfig() first.");
  }
  return cachedConfig;
}
