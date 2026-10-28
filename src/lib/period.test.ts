import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { currentPeriod, formatPeriodRange } from "./period";

// currentPeriod works in UTC, like the CLI's planner.CadencePeriod. Every
// case runs under zones on both sides of UTC to prove the browser's own
// zone never moves a period boundary.
const ZONES = ["UTC", "Australia/Sydney", "America/Los_Angeles", "Asia/Kolkata"];

const utc = (iso: string) => new Date(iso);

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

  describe("currentPeriod keys", () => {
    it("daily → YYYY-MM-DD with a one-day UTC window", () => {
      const p = currentPeriod("daily", utc("2026-03-15T09:30:00Z"));
      expect(p.key).toBe("2026-03-15");
      expect(p.start).toEqual(utc("2026-03-15T00:00:00Z"));
      expect(p.end).toEqual(utc("2026-03-16T00:00:00Z"));
    });

    it("monthly → YYYY-MM spanning the calendar month", () => {
      const p = currentPeriod("monthly", utc("2026-03-15T00:00:00Z"));
      expect(p.key).toBe("2026-03");
      expect(p.start).toEqual(utc("2026-03-01T00:00:00Z"));
      expect(p.end).toEqual(utc("2026-04-01T00:00:00Z"));
    });

    it("quarterly → YYYY-QN with a three-month window", () => {
      expect(currentPeriod("quarterly", utc("2026-02-10T00:00:00Z")).key).toBe("2026-Q1");
      expect(currentPeriod("quarterly", utc("2026-04-01T00:00:00Z")).key).toBe("2026-Q2");
      expect(currentPeriod("quarterly", utc("2026-12-31T23:00:00Z")).key).toBe("2026-Q4");
    });

    it("yearly → YYYY spanning the calendar year", () => {
      const p = currentPeriod("yearly", utc("2026-06-01T00:00:00Z"));
      expect(p.key).toBe("2026");
      expect(p.start).toEqual(utc("2026-01-01T00:00:00Z"));
      expect(p.end).toEqual(utc("2027-01-01T00:00:00Z"));
    });

    it("takes the UTC year at a year boundary, whatever the local date", () => {
      // 22:00 UTC on Dec 31 is already Jan 1 in Sydney; the CLI says 2026.
      expect(currentPeriod("yearly", utc("2026-12-31T22:00:00Z")).key).toBe("2026");
      // 01:00 UTC on Jan 1 is still Dec 31 in Los Angeles; the CLI says 2027.
      expect(currentPeriod("yearly", utc("2027-01-01T01:00:00Z")).key).toBe("2027");
      expect(currentPeriod("daily", utc("2027-01-01T01:00:00Z")).key).toBe("2027-01-01");
    });
  });

  describe("currentPeriod weekly (ISO week, Monday-anchored)", () => {
    it("anchors the window to Monday and spans seven days", () => {
      // 2026-03-15 is a Sunday; its ISO week starts Monday 2026-03-09.
      const p = currentPeriod("weekly", utc("2026-03-15T12:00:00Z"));
      expect(p.key).toBe("2026-W11");
      expect(p.start).toEqual(utc("2026-03-09T00:00:00Z"));
      expect(p.end).toEqual(utc("2026-03-16T00:00:00Z"));
    });

    it("uses ISO week-year at the January boundary (belongs to next year's W01)", () => {
      // 2026-01-01 is a Thursday; its ISO week 2026-W01 starts 2025-12-29.
      const p = currentPeriod("weekly", utc("2026-01-01T00:00:00Z"));
      expect(p.key).toBe("2026-W01");
      expect(p.start).toEqual(utc("2025-12-29T00:00:00Z"));
    });

    it("produces W53 for a 53-week ISO year", () => {
      // 2026 starts on a Thursday → it has 53 ISO weeks; 2026-12-31 is a Thursday.
      expect(currentPeriod("weekly", utc("2026-12-31T00:00:00Z")).key).toBe("2026-W53");
    });

    it("puts a late-December Monday in W01 of the next ISO year", () => {
      // 2024-12-30 is a Monday whose Thursday is 2025-01-02.
      expect(currentPeriod("weekly", utc("2024-12-31T00:00:00Z")).key).toBe("2025-W01");
    });
  });

  describe("formatPeriodRange", () => {
    it("renders a single day for a daily period", () => {
      expect(formatPeriodRange(currentPeriod("daily", utc("2026-03-15T23:30:00Z")))).toBe(
        "Mar 15, 2026 (UTC)",
      );
    });

    it("renders a same-year range without repeating the start year", () => {
      expect(formatPeriodRange(currentPeriod("monthly", utc("2026-03-15T00:00:00Z")))).toBe(
        "Mar 1 – Mar 31, 2026 (UTC)",
      );
      expect(formatPeriodRange(currentPeriod("yearly", utc("2026-06-01T00:00:00Z")))).toBe(
        "Jan 1 – Dec 31, 2026 (UTC)",
      );
    });

    it("renders both years for a range spanning the year boundary", () => {
      // The ISO week containing 2026-01-01 runs Mon 2025-12-29 → Sun 2026-01-04.
      expect(formatPeriodRange(currentPeriod("weekly", utc("2026-01-01T00:00:00Z")))).toBe(
        "Dec 29, 2025 – Jan 4, 2026 (UTC)",
      );
    });
  });
});
