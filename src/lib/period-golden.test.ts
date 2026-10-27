import { describe, expect, it } from "vitest";
import { currentPeriod } from "./period";
import { computeUploadPath, EVIDENCE_PDF_FILENAME } from "./storage-path";
import type { Frequency } from "@/types/catalog";
// The CLI's period and folder table (sigcomply-cli
// internal/planner/testdata/spa-golden/periods.json, made by
// TestSPAGoldenPeriods), copied byte for byte; scripts/check-goldens.sh
// catches drift.
import golden from "./__fixtures__/golden/periods.json";

interface PeriodRow {
  instant: string;
  cadence: string;
  used_by_catalog: boolean;
  frequency: Frequency;
  period_id: string;
  period_start: string;
  period_end: string;
  folder: string;
}

const rows = golden.periods as PeriodRow[];

// The CLI computes periods in UTC; currentPeriod uses the browser's local
// clock (AGENTS.md "Gotchas"). Each golden instant is handed to the SPA as
// the same wall-clock time in the local zone, which is what a browser in UTC
// sees, so the table checks the period arithmetic in any test time zone.
function utcWallClockAsLocal(iso: string): Date {
  const d = new Date(iso);
  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  );
}

// "2026-01-31T23:59:59.999999999Z" → the local Date with that wall clock,
// truncated to milliseconds.
function wallClock(iso: string): Date {
  return utcWallClockAsLocal(iso.replace(/(\.\d{3})\d*Z$/, "$1Z"));
}

function folderOf(prefix: string, evidenceId: string, periodId: string): string {
  const path = computeUploadPath(prefix, evidenceId, periodId);
  return path.slice(0, path.length - EVIDENCE_PDF_FILENAME.length);
}

describe("CLI golden periods", () => {
  it("covers every SPA frequency", () => {
    expect(new Set(rows.map((r) => r.frequency))).toEqual(
      new Set(["daily", "weekly", "monthly", "quarterly", "yearly"]),
    );
  });

  describe.each(rows)("$instant $cadence", (row) => {
    const p = currentPeriod(row.frequency, utcWallClockAsLocal(row.instant));

    it("gives the CLI's period_id", () => {
      expect(p.key).toBe(row.period_id);
    });

    it("gives the CLI's window (CLI end inclusive, SPA end exclusive)", () => {
      expect(p.start).toEqual(wallClock(row.period_start));
      expect(new Date(p.end.getTime() - 1)).toEqual(wallClock(row.period_end));
    });

    it("gives the CLI's upload folder", () => {
      expect(folderOf(golden.prefix, golden.evidence_id, p.key)).toBe(row.folder);
    });
  });
});

describe("CLI golden folders", () => {
  it.each(golden.folders)(
    "prefix $prefix → $folder",
    ({ prefix, evidence_id, period_id, folder }) => {
      expect(folderOf(prefix, evidence_id, period_id)).toBe(folder);
    },
  );
});
