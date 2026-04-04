import { getISOWeek, getISOWeekYear } from "date-fns";
import type { Frequency } from "@/types/catalog";

export interface Period {
  key: string;
  start: Date;
  end: Date;
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
