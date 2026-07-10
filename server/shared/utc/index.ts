/**
 * Canonical UTC calendar helpers — single source of truth for daily/weekly/monthly boundaries.
 * All earn modules, crons, and resets must use these functions (never local TZ or America/Sao_Paulo).
 */

const MS_PER_DAY = 86_400_000;

/** Current instant (explicit UTC usage; prefer over bare `new Date()` in business logic). */
export function utcNow(): Date {
  return new Date();
}

/** UTC calendar date `YYYY-MM-DD`. */
export function utcToday(now: Date = utcNow()): string {
  return now.toISOString().slice(0, 10);
}

/** @alias utcToday */
export function getUtcCalendarDate(now: Date = utcNow()): string {
  return utcToday(now);
}

export function utcYesterday(now: Date = utcNow()): string {
  return addDaysToUtcDateKey(utcToday(now), -1);
}

/** Midnight UTC for the calendar day of `now`. */
export function utcStartOfDay(now: Date = utcNow()): Date {
  const [y, m, d] = utcToday(now).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

/** @alias utcStartOfDay */
export function getUtcDayStart(now: Date = utcNow()): Date {
  return utcStartOfDay(now);
}

/** Last millisecond of the UTC calendar day containing `now`. */
export function utcEndOfDay(now: Date = utcNow()): Date {
  return new Date(utcStartOfDay(now).getTime() + MS_PER_DAY - 1);
}

/** Next daily reset at 00:00 UTC (start of next UTC calendar day). */
export function utcNextResetAt(now: Date = utcNow()): Date {
  return new Date(utcStartOfDay(now).getTime() + MS_PER_DAY);
}

/** @alias utcNextResetAt */
export function getNextUtcResetAt(now: Date = utcNow()): Date {
  return utcNextResetAt(now);
}

export function msUntilUtcReset(now: Date = utcNow()): number {
  return Math.max(0, utcNextResetAt(now).getTime() - now.getTime());
}

/** @alias msUntilUtcReset */
export function msUntilNextUtcReset(now: Date = utcNow()): number {
  return msUntilUtcReset(now);
}

export function utcYear(now: Date = utcNow()): number {
  return now.getUTCFullYear();
}

export function utcMonthKey(now: Date = utcNow()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** ISO 8601 week `YYYY-Www` (Monday-based, UTC). */
export function utcWeekKey(now: Date = utcNow()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const isoYear = d.getUTCFullYear();
  const week1 = new Date(Date.UTC(isoYear, 0, 4));
  week1.setUTCDate(week1.getUTCDate() - ((week1.getUTCDay() + 6) % 7));
  const weekNo = 1 + Math.round((d.getTime() - week1.getTime()) / 604_800_000);
  return `${isoYear}-W${String(weekNo).padStart(2, "0")}`;
}

function pad2(value: number | string): string {
  return String(value).padStart(2, "0");
}

function buildDateKey(year: number | string, month: number | string, day: number | string): string {
  return `${String(year)}-${pad2(month)}-${pad2(day)}`;
}

/** Normalize textual date keys to `YYYY-MM-DD` (UTC calendar semantics). */
export function normalizeUtcDateKey(input: Date | string | null | undefined): string {
  if (input instanceof Date) return utcToday(input);
  if (typeof input !== "string") return "";
  const raw = input.trim();
  if (!raw) return "";

  const ymdDash = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (ymdDash) return buildDateKey(ymdDash[1], ymdDash[2], ymdDash[3]);

  const ymdSlash = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[T\s].*)?$/);
  if (ymdSlash) return buildDateKey(ymdSlash[1], ymdSlash[2], ymdSlash[3]);

  const mdySlash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T\s].*)?$/);
  if (mdySlash) return buildDateKey(mdySlash[3], mdySlash[1], mdySlash[2]);

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return utcToday(parsed);
  return "";
}

export function addDaysToUtcDateKey(dateKey: string, deltaDays: number): string {
  const normalized = normalizeUtcDateKey(dateKey);
  if (!normalized) throw new Error(`Invalid UTC date key: ${String(dateKey)}`);
  const [y, m, d] = normalized.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + Number(deltaDays), 12, 0, 0));
  return utcToday(shifted);
}

/** Aliases for legacy period keys (same civil day, multiple string shapes). */
export function getUtcDateKeyAliases(input: Date | string = utcNow()): string[] {
  const normalized = normalizeUtcDateKey(input);
  if (!normalized) return [];
  const [year, month, day] = normalized.split("-");
  const m = String(Number(month));
  const d = String(Number(day));
  return Array.from(
    new Set([
      normalized,
      `${year}-${m}-${d}`,
      `${year}/${month}/${day}`,
      `${year}/${m}/${d}`,
      `${month}/${day}/${year}`,
      `${m}/${d}/${year}`,
    ]),
  );
}

export function utcDateFieldToString(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

export function wasViewedOnUtcDate(
  lastViewedUtcDate: Date | null | undefined,
  viewedAt: Date | null | undefined,
  now: Date = utcNow(),
): boolean {
  const today = utcToday(now);
  const fromField = utcDateFieldToString(lastViewedUtcDate);
  if (fromField) return fromField === today;
  if (viewedAt) return utcToday(viewedAt) === today;
  return false;
}

export function utcDateFromNow(now: Date = utcNow()): Date {
  return utcStartOfDay(now);
}

export function isInstantBeforeUtcDay(instant: Date, now: Date = utcNow()): boolean {
  return instant.getTime() < utcStartOfDay(now).getTime();
}

export function isEarnedInUtcDay(earnedAt: Date, now: Date = utcNow()): boolean {
  const t = earnedAt.getTime();
  return t >= utcStartOfDay(now).getTime() && t < utcNextResetAt(now).getTime();
}

/** API meta for daily-reset countdown UIs (always UTC). */
export function utcDailyResetMeta(now: Date = utcNow()) {
  return {
    timezone: "UTC",
    localDate: utcToday(now),
    nextResetAt: utcNextResetAt(now).toISOString(),
    nextResetInMs: msUntilUtcReset(now),
  };
}

/** Inclusive UTC day bounds for Prisma range queries. */
export function utcDayBounds(now: Date = utcNow()): { start: Date; end: Date } {
  const start = utcStartOfDay(now);
  return { start, end: new Date(start.getTime() + MS_PER_DAY) };
}
