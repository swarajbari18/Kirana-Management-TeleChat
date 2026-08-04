import { describe, expect, it } from "vitest";
import {
  enumerateIstDaysInclusive,
  formatIstMonthYear,
  previousCompleteMonthRange,
  previousCompleteWeekRange,
  startOfIstDay,
  startOfIstWeekMonday,
  toIstDateIso,
} from "./period-boundaries.js";

describe("PERIOD-01", () => {
  it("Tuesday IST uses prior Mon–Sun for weekly and Mon+Tue in current_week", () => {
    const tuesday = new Date("2026-08-11T04:30:00.000Z");
    const weekStart = startOfIstWeekMonday(tuesday);
    const weekly = previousCompleteWeekRange(tuesday);
    const days = enumerateIstDaysInclusive(weekStart, tuesday);

    expect(toIstDateIso(tuesday)).toBe("2026-08-11");
    expect(toIstDateIso(weekStart)).toBe("2026-08-10");
    expect(days).toEqual(["2026-08-10", "2026-08-11"]);
    expect(toIstDateIso(weekly.start)).toBe("2026-08-03");
    expect(toIstDateIso(weekly.end)).toBe("2026-08-09");
  });
});

describe("PERIOD-02", () => {
  it("first day of month uses previous full month for monthly", () => {
    const firstDay = new Date("2026-08-01T01:00:00.000Z");
    const monthly = previousCompleteMonthRange(firstDay);
    expect(toIstDateIso(monthly.start)).toBe("2026-07-01");
    expect(toIstDateIso(monthly.end)).toBe("2026-07-31");
    expect(formatIstMonthYear(monthly.start)).toBe("July 2026");
  });
});

describe("PERIOD-03", () => {
  it("Jan 1 yearly is single day and monthly is December", () => {
    const jan1 = new Date("2026-01-01T01:00:00.000Z");
    const monthly = previousCompleteMonthRange(jan1);
    const yearlyStart = startOfIstDay(new Date("2026-01-01T00:00:00.000Z"));
    expect(toIstDateIso(yearlyStart)).toBe("2026-01-01");
    expect(toIstDateIso(monthly.start)).toBe("2025-12-01");
    expect(toIstDateIso(monthly.end)).toBe("2025-12-31");
  });
});
