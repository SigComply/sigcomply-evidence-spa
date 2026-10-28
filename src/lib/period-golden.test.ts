import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

// Both sides compute periods in UTC, so each golden instant is handed over as
// the same instant. The table runs under zones either side of UTC to prove the
// browser's zone never changes the answer.
const ZONES = ["UTC", "Australia/Sydney", "America/Los_Angeles"];

// Go writes nanoseconds; Date keeps milliseconds.
function instant(iso: string): Date {
  return new Date(iso.replace(/(\.\d{3})\d*Z$/, "$1Z"));
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

  describe.each(ZONES)("in TZ=%s", (zone) => {
    let saved: string | undefined;
    beforeAll(() => {
      saved = process.env.TZ;
      process.env.TZ = zone;
    });
    afterAll(() => {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    });

    describe.each(rows)("$instant $cadence", (row) => {
      it("gives the CLI's period_id", () => {
        expect(currentPeriod(row.frequency, instant(row.instant)).key).toBe(row.period_id);
      });

      it("gives the CLI's window (CLI end inclusive, SPA end exclusive)", () => {
        const p = currentPeriod(row.frequency, instant(row.instant));
        expect(p.start).toEqual(instant(row.period_start));
        expect(new Date(p.end.getTime() - 1)).toEqual(instant(row.period_end));
      });

      it("gives the CLI's upload folder", () => {
        const p = currentPeriod(row.frequency, instant(row.instant));
        expect(folderOf(golden.prefix, golden.evidence_id, p.key)).toBe(row.folder);
      });
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
