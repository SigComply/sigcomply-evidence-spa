import type { Frequency } from "@/types/catalog";

export interface Period {
  key: string;
  start: Date;
  end: Date;
}

// Every period here is computed in UTC, like the CLI's planner.CadencePeriod
// (sigcomply-cli internal/planner/period.go). A browser east or west of UTC
// would otherwise show a different folder than the one the CLI reads in the
// hours around each period boundary.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function utcDay(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// formatPeriodRange renders a Period as a human window in UTC. `end` is
// exclusive (it is the next period's start), so the displayed last day is
// end − 1ms. Examples: "Apr 18, 2026" (daily), "Apr 1 – Jun 30, 2026"
// (quarterly), "Dec 29, 2025 – Jan 4, 2026" (a week spanning the year).
export function formatPeriodRange(p: Period): string {
  const lastDay = new Date(p.end.getTime() - 1);
  const startYear = p.start.getUTCFullYear();
  const endYear = lastDay.getUTCFullYear();

  if (utcDateKey(p.start) === utcDateKey(lastDay)) {
    return `${utcDay(p.start)}, ${startYear}`;
  }
  if (startYear === endYear) {
    return `${utcDay(p.start)} – ${utcDay(lastDay)}, ${endYear}`;
  }
  return `${utcDay(p.start)}, ${startYear} – ${utcDay(lastDay)}, ${endYear}`;
}

export function currentPeriod(freq: Frequency, now: Date = new Date()): Period {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  switch (freq) {
    case "daily": {
      const start = new Date(Date.UTC(y, m, d));
      return { key: utcDateKey(start), start, end: new Date(Date.UTC(y, m, d + 1)) };
    }
    case "weekly": {
      // Monday-anchored, labelled with the ISO-8601 week of that Monday.
      const sinceMonday = (now.getUTCDay() + 6) % 7;
      const start = new Date(Date.UTC(y, m, d - sinceMonday));
      const end = new Date(Date.UTC(y, m, d - sinceMonday + 7));
      return { key: isoWeekKey(start), start, end };
    }
    case "monthly":
      return {
        key: `${y}-${pad2(m + 1)}`,
        start: new Date(Date.UTC(y, m, 1)),
        end: new Date(Date.UTC(y, m + 1, 1)),
      };
    case "quarterly": {
      const q = Math.floor(m / 3);
      return {
        key: `${y}-Q${q + 1}`,
        start: new Date(Date.UTC(y, q * 3, 1)),
        end: new Date(Date.UTC(y, q * 3 + 3, 1)),
      };
    }
    case "yearly":
      return {
        key: `${y}`,
        start: new Date(Date.UTC(y, 0, 1)),
        end: new Date(Date.UTC(y + 1, 0, 1)),
      };
  }
}

// isoWeekKey labels a UTC Monday with its ISO week: the week belongs to the
// year that holds its Thursday.
function isoWeekKey(monday: Date): string {
  const thursday = new Date(monday.getTime() + 3 * 86_400_000);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / (7 * 86_400_000)) + 1;
  return `${year}-W${pad2(week)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function utcDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
