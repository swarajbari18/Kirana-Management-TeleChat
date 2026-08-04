const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface IstDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number;
}

export function getIstNow(now: Date = new Date()): Date {
  return now;
}

export function toIstParts(date: Date): IstDateParts {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    dayOfWeek: shifted.getUTCDay(),
  };
}

export function istInstantToUtcDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): Date {
  return new Date(
    Date.UTC(year, month, day, hour, minute, second, ms) - IST_OFFSET_MS,
  );
}

export function startOfIstDay(date: Date): Date {
  const parts = toIstParts(date);
  return istInstantToUtcDate(parts.year, parts.month, parts.day);
}

export function startOfIstWeekMonday(date: Date): Date {
  const parts = toIstParts(date);
  const daysSinceMonday = (parts.dayOfWeek + 6) % 7;
  const mondayDay = parts.day - daysSinceMonday;
  return istInstantToUtcDate(parts.year, parts.month, mondayDay);
}

export function startOfIstMonth(date: Date): Date {
  const parts = toIstParts(date);
  return istInstantToUtcDate(parts.year, parts.month, 1);
}

export function startOfIstYear(date: Date): Date {
  const parts = toIstParts(date);
  return istInstantToUtcDate(parts.year, 0, 1);
}

export function previousCompleteWeekRange(date: Date): {
  start: Date;
  end: Date;
} {
  const currentWeekStart = startOfIstWeekMonday(date);
  const end = new Date(currentWeekStart.getTime() - 1);
  const endParts = toIstParts(end);
  const start = istInstantToUtcDate(
    endParts.year,
    endParts.month,
    endParts.day - 6,
  );
  return { start, end };
}

export function previousCompleteMonthRange(date: Date): {
  start: Date;
  end: Date;
} {
  const currentMonthStart = startOfIstMonth(date);
  const end = new Date(currentMonthStart.getTime() - 1);
  const endParts = toIstParts(end);
  const start = istInstantToUtcDate(endParts.year, endParts.month, 1);
  return { start, end };
}

export function toIstDateIso(date: Date): string {
  const parts = toIstParts(date);
  const month = String(parts.month + 1).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

export function formatIstFilenameTimestamp(date: Date): string {
  const parts = toIstParts(date);
  const month = String(parts.month + 1).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  const hour = String(parts.hour).padStart(2, "0");
  const minute = String(parts.minute).padStart(2, "0");
  return `${parts.year}${month}${day}-${hour}${minute}`;
}

export function formatIstShortDate(date: Date): string {
  const parts = toIstParts(date);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${parts.day} ${months[parts.month]}`;
}

export function formatIstMonthYear(date: Date): string {
  const parts = toIstParts(date);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[parts.month]} ${parts.year}`;
}

export function enumerateIstDaysInclusive(start: Date, end: Date): string[] {
  const days: string[] = [];
  let cursor = startOfIstDay(start);
  const endDay = startOfIstDay(end);
  while (cursor.getTime() <= endDay.getTime()) {
    days.push(toIstDateIso(cursor));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return days;
}

export function billFinalizedAtToIstDateIso(finalizedAtIso: string): string {
  return toIstDateIso(new Date(finalizedAtIso));
}

export function isWithinRange(
  valueIso: string,
  startIso: string,
  endIso: string,
): boolean {
  const value = new Date(valueIso).getTime();
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  return value >= start && value < end;
}
