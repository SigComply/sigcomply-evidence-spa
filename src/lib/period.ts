import { format, getISOWeek, getISOWeekYear } from "date-fns";
import type { Frequency } from "@/types/catalog";

export interface Period {
  key: string;
  start: Date;
  end: Date;
}

// formatPeriodRange renders a Period as a human window. `end` is exclusive
// (it is the next period's start), so the displayed last day is end − 1ms.
// Examples: "Apr 18, 2026" (daily), "Apr 1 – Jun 30, 2026" (quarterly),
// "Dec 29, 2025 – Jan 4, 2026" (a week spanning the year boundary).
export function formatPeriodRange(p: Period): string {
  const lastDay = new Date(p.end.getTime() - 1);

  const sameDay =
    p.start.getFullYear() === lastDay.getFullYear() &&
    p.start.getMonth() === lastDay.getMonth() &&
    p.start.getDate() === lastDay.getDate();
  if (sameDay) return format(p.start, "MMM d, yyyy");

  const sameYear = p.start.getFullYear() === lastDay.getFullYear();
  if (sameYear) {
    return `${format(p.start, "MMM d")} – ${format(lastDay, "MMM d, yyyy")}`;
  }
  return `${format(p.start, "MMM d, yyyy")} – ${format(lastDay, "MMM d, yyyy")}`;
}

export function currentPeriod(freq: Frequency, now: Date = new Date()): Period {
  switch (freq) {
    case "daily": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return {
        key: formatDate(start),
        start,
        end,
      };
    }
    case "weekly": {
      const weekday = now.getDay() === 0 ? 7 : now.getDay();
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - (weekday - 1)
      );
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const week = getISOWeek(start);
      const year = getISOWeekYear(start);
      return {
        key: `${year}-W${String(week).padStart(2, "0")}`,
        start,
        end,
      };
    }
    case "monthly": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return {
        key: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
        start,
        end,
      };
    }
    case "quarterly": {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      const end = new Date(now.getFullYear(), q * 3 + 3, 1);
      return {
        key: `${now.getFullYear()}-Q${q + 1}`,
        start,
        end,
      };
    }
    case "yearly": {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear() + 1, 0, 1);
      return {
        key: `${now.getFullYear()}`,
        start,
        end,
      };
    }
  }
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
