import { describe, it, expect } from "vitest";
import { currentPeriod, formatPeriodRange } from "./period";

// Anchor dates are constructed with the local-time Date constructor to match
// currentPeriod, which works in local time (period boundaries are the
// browser's midnight — see CLAUDE.md gotcha).

describe("currentPeriod keys", () => {
  it("daily → YYYY-MM-DD with a one-day window", () => {
    const p = currentPeriod("daily", new Date(2026, 2, 15, 9, 30));
    expect(p.key).toBe("2026-03-15");
    expect(p.start).toEqual(new Date(2026, 2, 15));
    expect(p.end).toEqual(new Date(2026, 2, 16));
  });

  it("monthly → YYYY-MM spanning the calendar month", () => {
    const p = currentPeriod("monthly", new Date(2026, 2, 15));
    expect(p.key).toBe("2026-03");
    expect(p.start).toEqual(new Date(2026, 2, 1));
    expect(p.end).toEqual(new Date(2026, 3, 1));
  });

  it("quarterly → YYYY-QN with a three-month window", () => {
    expect(currentPeriod("quarterly", new Date(2026, 1, 10)).key).toBe(
      "2026-Q1",
    );
    expect(currentPeriod("quarterly", new Date(2026, 3, 1)).key).toBe("2026-Q2");
    expect(currentPeriod("quarterly", new Date(2026, 11, 31)).key).toBe(
      "2026-Q4",
    );
  });

  it("yearly → YYYY spanning the calendar year", () => {
    const p = currentPeriod("yearly", new Date(2026, 5, 1));
    expect(p.key).toBe("2026");
    expect(p.start).toEqual(new Date(2026, 0, 1));
    expect(p.end).toEqual(new Date(2027, 0, 1));
  });
});

describe("currentPeriod weekly (ISO week, Monday-anchored)", () => {
  it("anchors the window to Monday and spans seven days", () => {
    // 2026-03-15 is a Sunday; its ISO week starts Monday 2026-03-09.
    const p = currentPeriod("weekly", new Date(2026, 2, 15));
    expect(p.start.getDay()).toBe(1); // Monday
    expect(p.end.getTime() - p.start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(p.key).toMatch(/^\d{4}-W\d{2}$/);
  });

  it("uses ISO week-year at the January boundary (belongs to next year's W01)", () => {
    // 2026-01-01 is a Thursday; the ISO week containing it is 2026-W01, whose
    // Monday is 2025-12-29.
    const p = currentPeriod("weekly", new Date(2026, 0, 1));
    expect(p.key).toBe("2026-W01");
    expect(p.start).toEqual(new Date(2025, 11, 29));
  });

  it("produces W53 for a 53-week ISO year", () => {
    // 2026 starts on a Thursday → it has 53 ISO weeks; 2026-12-31 is a Thursday.
    expect(currentPeriod("weekly", new Date(2026, 11, 31)).key).toBe("2026-W53");
  });
});

describe("formatPeriodRange", () => {
  it("renders a single day for a daily period", () => {
    expect(formatPeriodRange(currentPeriod("daily", new Date(2026, 2, 15)))).toBe(
      "Mar 15, 2026",
    );
  });

  it("renders a same-year range without repeating the start year", () => {
    expect(
      formatPeriodRange(currentPeriod("monthly", new Date(2026, 2, 15))),
    ).toBe("Mar 1 – Mar 31, 2026");
    expect(
      formatPeriodRange(currentPeriod("yearly", new Date(2026, 5, 1))),
    ).toBe("Jan 1 – Dec 31, 2026");
  });

  it("renders both years for a range spanning the year boundary", () => {
    // The ISO week containing 2026-01-01 runs Mon 2025-12-29 → Sun 2026-01-04.
    expect(
      formatPeriodRange(currentPeriod("weekly", new Date(2026, 0, 1))),
    ).toBe("Dec 29, 2025 – Jan 4, 2026");
  });
});
