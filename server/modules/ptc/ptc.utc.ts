/** UTC calendar date as `YYYY-MM-DD` (never uses local/server timezone). */
export function getUtcCalendarDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Midnight UTC for the calendar day of `now`. */
export function getUtcDayStart(now = new Date()): Date {
  const [y, m, d] = getUtcCalendarDate(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

/** Next daily reset at 00:00 UTC (start of the next UTC calendar day). */
export function getNextUtcResetAt(now = new Date()): Date {
  const start = getUtcDayStart(now);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export function msUntilNextUtcReset(now = new Date()): number {
  return Math.max(0, getNextUtcResetAt(now).getTime() - now.getTime());
}

/** Prisma `@db.Date` values are UTC midnight — compare by calendar day string. */
export function utcDateFieldToString(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export function wasViewedOnUtcDate(
  lastViewedUtcDate: Date | null | undefined,
  viewedAt: Date | null | undefined,
  now = new Date(),
): boolean {
  const today = getUtcCalendarDate(now);
  const fromField = utcDateFieldToString(lastViewedUtcDate);
  if (fromField) return fromField === today;
  if (viewedAt) return getUtcCalendarDate(viewedAt) === today;
  return false;
}

export function utcDateFromNow(now = new Date()): Date {
  return getUtcDayStart(now);
}
