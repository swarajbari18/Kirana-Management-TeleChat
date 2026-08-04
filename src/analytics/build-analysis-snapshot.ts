import type { StoreDatabase } from "../store-durable-object/persistence/db.js";
import { getShopProfile } from "../store-durable-object/persistence/repositories/shop-profile-repository.js";
import {
  aggregateBillsByIstDay,
  aggregateBillsInRange,
  aggregateKhataCreditsInRange,
  aggregateTopItemsInRange,
  getTotalOutstandingUdharPaise,
  listLowStockProducts,
} from "../store-durable-object/persistence/repositories/analytics-repository.js";
import type {
  AnalysisSnapshot,
  DayRowMetrics,
  PeriodMetrics,
  PeriodRange,
} from "./types.js";
import {
  enumerateIstDaysInclusive,
  formatIstMonthYear,
  formatIstShortDate,
  getIstNow,
  istInstantToUtcDate,
  previousCompleteMonthRange,
  previousCompleteWeekRange,
  startOfIstDay,
  startOfIstMonth,
  startOfIstWeekMonday,
  startOfIstYear,
} from "./period-boundaries.js";

async function buildPeriodMetrics(
  db: StoreDatabase,
  range: PeriodRange,
  outstandingUdharPaise: number,
): Promise<PeriodMetrics> {
  const bills = await aggregateBillsInRange(db, range.startIso, range.endIso);
  const topItems = await aggregateTopItemsInRange(
    db,
    range.startIso,
    range.endIso,
  );
  const khataCredits = await aggregateKhataCreditsInRange(
    db,
    range.startIso,
    range.endIso,
  );

  return {
    periodId: range.periodId,
    label: range.label,
    rangeStartIso: range.startIso,
    rangeEndIso: range.endIso,
    totalSalesPaise: bills.totalSalesPaise,
    billCount: bills.billCount,
    gstCollectedPaise: bills.gstCollectedPaise,
    paymentBreakdown: bills.paymentBreakdown,
    khataCreditsInPeriod: khataCredits,
    topItems,
    totalOutstandingUdharPaise: outstandingUdharPaise,
  };
}

function emptyDayRow(
  dateIso: string,
  outstandingUdharPaise: number,
): DayRowMetrics {
  return {
    dateIso,
    totalSalesPaise: 0,
    billCount: 0,
    gstCollectedPaise: 0,
    paymentBreakdown: {
      cash: { paise: 0, count: 0 },
      upi: { paise: 0, count: 0 },
      khata: { paise: 0, count: 0 },
    },
    khataCreditsInPeriod: { creditSalePaise: 0, manualCreditPaise: 0 },
    totalOutstandingUdharPaise: outstandingUdharPaise,
  };
}

function istDayRangeIso(dateIso: string): { startIso: string; endIso: string } {
  const [year, month, day] = dateIso.split("-").map(Number);
  const start = istInstantToUtcDate(year!, month! - 1, day!);
  const end = istInstantToUtcDate(year!, month! - 1, day! + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function buildPeriodRanges(now: Date): {
  daily: PeriodRange;
  currentWeek: PeriodRange;
  weekly: PeriodRange;
  currentMonth: PeriodRange;
  monthly: PeriodRange;
  yearly: PeriodRange;
} {
  const nowIso = now.toISOString();
  const dailyStart = startOfIstDay(now);
  const currentWeekStart = startOfIstWeekMonday(now);
  const currentMonthStart = startOfIstMonth(now);
  const yearlyStart = startOfIstYear(now);
  const prevWeek = previousCompleteWeekRange(now);
  const prevMonth = previousCompleteMonthRange(now);

  return {
    daily: {
      periodId: "daily",
      label: "Today",
      startIso: dailyStart.toISOString(),
      endIso: nowIso,
    },
    currentWeek: {
      periodId: "current_week",
      label: `This week (${formatIstShortDate(currentWeekStart)} – today)`,
      startIso: currentWeekStart.toISOString(),
      endIso: nowIso,
    },
    weekly: {
      periodId: "weekly",
      label: `Week of ${formatIstShortDate(prevWeek.start)} – ${formatIstShortDate(prevWeek.end)}`,
      startIso: prevWeek.start.toISOString(),
      endIso: new Date(prevWeek.end.getTime() + 1).toISOString(),
    },
    currentMonth: {
      periodId: "current_month",
      label: `This month (${formatIstMonthYear(now)})`,
      startIso: currentMonthStart.toISOString(),
      endIso: nowIso,
    },
    monthly: {
      periodId: "monthly",
      label: formatIstMonthYear(prevMonth.start),
      startIso: prevMonth.start.toISOString(),
      endIso: new Date(prevMonth.end.getTime() + 1).toISOString(),
    },
    yearly: {
      periodId: "yearly",
      label: "Year to date",
      startIso: yearlyStart.toISOString(),
      endIso: nowIso,
    },
  };
}

export async function buildAnalysisSnapshot(
  db: StoreDatabase,
  now: Date = getIstNow(),
): Promise<AnalysisSnapshot> {
  const shop = await getShopProfile(db);
  const outstandingUdharPaise = await getTotalOutstandingUdharPaise(db);
  const lowStockProducts = await listLowStockProducts(db);
  const ranges = buildPeriodRanges(now);

  const [daily, currentWeekBase, weekly, currentMonth, monthly, yearly] =
    await Promise.all([
      buildPeriodMetrics(db, ranges.daily, outstandingUdharPaise),
      buildPeriodMetrics(db, ranges.currentWeek, outstandingUdharPaise),
      buildPeriodMetrics(db, ranges.weekly, outstandingUdharPaise),
      buildPeriodMetrics(db, ranges.currentMonth, outstandingUdharPaise),
      buildPeriodMetrics(db, ranges.monthly, outstandingUdharPaise),
      buildPeriodMetrics(db, ranges.yearly, outstandingUdharPaise),
    ]);

  const dayIsos = enumerateIstDaysInclusive(
    new Date(ranges.currentWeek.startIso),
    now,
  );
  const aggregatedDays = await aggregateBillsByIstDay(
    db,
    ranges.currentWeek.startIso,
    ranges.currentWeek.endIso,
  );
  const dayByIso = new Map(aggregatedDays.map((row) => [row.dateIso, row]));

  const days: DayRowMetrics[] = await Promise.all(
    dayIsos.map(async (dateIso) => {
      const row = dayByIso.get(dateIso);
      const dayRange = istDayRangeIso(dateIso);
      const khataCredits = await aggregateKhataCreditsInRange(
        db,
        dayRange.startIso,
        dayRange.endIso,
      );
      if (!row) {
        return {
          ...emptyDayRow(dateIso, outstandingUdharPaise),
          khataCreditsInPeriod: khataCredits,
        };
      }
      return {
        dateIso,
        totalSalesPaise: row.totalSalesPaise,
        billCount: row.billCount,
        gstCollectedPaise: row.gstCollectedPaise,
        paymentBreakdown: row.paymentBreakdown,
        khataCreditsInPeriod: khataCredits,
        totalOutstandingUdharPaise: outstandingUdharPaise,
      };
    }),
  );

  return {
    generatedAtIso: now.toISOString(),
    shopName: shop.shopName ?? "Shop",
    daily,
    currentWeek: { ...currentWeekBase, days },
    weekly,
    currentMonth,
    monthly,
    yearly,
    lowStockProducts,
  };
}
