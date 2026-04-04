import type { RuntimeConfig } from "@/types/config";

let cachedConfig: RuntimeConfig | null = null;

export async function loadConfig(): Promise<RuntimeConfig> {
  if (cachedConfig) return cachedConfig;

  const resp = await fetch("/config.json");
  if (!resp.ok) {
    // Default config when config.json is missing
    cachedConfig = {
      frameworks: ["soc2"],
      storage: { show_upload_path: true, prefix: "manual-evidence" },
    };
    return cachedConfig;
  }

  cachedConfig = (await resp.json()) as RuntimeConfig;
  return cachedConfig;
}

export function getConfig(): RuntimeConfig {
  if (!cachedConfig) {
    throw new Error("Config not loaded. Call loadConfig() first.");
  }
  return cachedConfig;
}
