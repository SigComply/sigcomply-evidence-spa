// device-memory: a *local-only*, *non-authoritative* memory of what the user
// did in THIS browser. It is explicitly NOT compliance status — the SPA has
// no bucket access and cannot know whether a file was actually uploaded or
// whether the CLI counted it. Treat every value here as a personal sticky
// note, never as proof. The CLI + the customer's bucket remain the only
// source of truth. UI that surfaces this must say so.
//
// Stored as one namespaced JSON blob (convention: `sigcomply:*`) keyed by
// framework|evidence_id|period so it naturally scopes to the current period.

const STORE_KEY = "sigcomply:device-memory";

export interface DeviceRecord {
  /** ISO timestamp the PDF was generated in this browser. */
  generatedAt?: string;
  /** ISO timestamp the user manually ticked "uploaded" here. Self-asserted. */
  uploadedAt?: string;
}

type Store = Record<string, DeviceRecord>;

function recordKey(
  framework: string,
  evidenceId: string,
  period: string,
): string {
  return `${framework}|${evidenceId}|${period}`;
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // localStorage unavailable / full — device memory is best-effort only.
  }
}

export function getDeviceRecord(
  framework: string,
  evidenceId: string,
  period: string,
): DeviceRecord | undefined {
  return readStore()[recordKey(framework, evidenceId, period)];
}

function patchRecord(
  framework: string,
  evidenceId: string,
  period: string,
  patch: Partial<DeviceRecord>,
): void {
  const store = readStore();
  const k = recordKey(framework, evidenceId, period);
  store[k] = { ...store[k], ...patch };
  writeStore(store);
}

export function markGenerated(
  framework: string,
  evidenceId: string,
  period: string,
): void {
  patchRecord(framework, evidenceId, period, {
    generatedAt: new Date().toISOString(),
  });
}

export function setUploadedAck(
  framework: string,
  evidenceId: string,
  period: string,
  uploaded: boolean,
): void {
  patchRecord(framework, evidenceId, period, {
    uploadedAt: uploaded ? new Date().toISOString() : undefined,
  });
}
