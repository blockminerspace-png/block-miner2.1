import {
  addDaysToBrazilDateKey,
  getBrazilCheckinDateKey,
  getBrazilDateKeyAliases,
  normalizeBrazilDateKey,
} from "../../utils/checkinDate.js";
import { getCheckinGraceHours, getCheckinResetHour, getCheckinTimezone } from "./checkin.config.js";

export type CheckinConfig = {
  timezone: string;
  resetHour: number;
  graceHours: number;
};

export type CheckinPeriod = {
  dateKey: string;
  startsAt: Date;
  endsAt: Date;
  nextResetAt: Date;
  timezone: string;
  resetHour: number;
};

export function getDefaultCheckinConfig(env: NodeJS.ProcessEnv = process.env): CheckinConfig {
  return {
    timezone: getCheckinTimezone(env),
    resetHour: getCheckinResetHour(env),
    graceHours: getCheckinGraceHours(env),
  };
}

function getBrazilHourMinute(now: Date, timezone: string): { hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour, minute };
}

/** BRT reset instant on a Brazil calendar day (UTC offset +3, no DST). */
function resetInstantOnCalendarDay(year: number, month: number, day: number, resetHour: number): Date {
  let utcHour = resetHour + 3;
  let y = year;
  let m = month;
  let d = day;
  if (utcHour >= 24) {
    utcHour -= 24;
    const carry = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
    y = carry.getUTCFullYear();
    m = carry.getUTCMonth() + 1;
    d = carry.getUTCDate();
  }
  return new Date(Date.UTC(y, m - 1, d, utcHour, 0, 0));
}

/**
 * Period end dateKey (Option B): the civil day when the window closes at resetHour.
 * Example: 2026-05-19 21:00 → 2026-05-20 20:59:59 BRT uses dateKey 2026-05-20.
 */
export function getCheckinPeriodEndKey(
  now: Date = new Date(),
  config: CheckinConfig = getDefaultCheckinConfig(),
): string {
  const calendarKey = getBrazilCheckinDateKey(now);
  const { hour } = getBrazilHourMinute(now, config.timezone);
  if (hour >= config.resetHour) {
    return addDaysToBrazilDateKey(calendarKey, 1);
  }
  return calendarKey;
}

/** @deprecated Legacy Option A start-day key for the same period as `endKey`. */
export function getLegacyPeriodStartKey(endKey: string): string {
  return addDaysToBrazilDateKey(endKey, -1);
}

export function isSameCheckinPeriod(storedKey: string, currentEndKey: string): boolean {
  const stored = normalizeBrazilDateKey(storedKey);
  const current = normalizeBrazilDateKey(currentEndKey);
  if (!stored || !current) return false;
  return stored === current;
}

/** True when `storedKey` is the immediately preceding period (end or legacy start key). */
export function isPreviousPeriodEndKey(storedKey: string, currentEndKey: string): boolean {
  const stored = normalizeBrazilDateKey(storedKey);
  const current = normalizeBrazilDateKey(currentEndKey);
  if (!stored || !current) return false;
  const prevEnd = addDaysToBrazilDateKey(current, -1);
  return stored === prevEnd;
}

/** DB lookup keys for a period end dateKey (current + legacy start aliases). */
export function getCheckinPeriodLookupKeys(endKey: string): string[] {
  const normalized = normalizeBrazilDateKey(endKey);
  if (!normalized) return [];
  const keys = new Set<string>();
  for (const alias of getBrazilDateKeyAliases(normalized)) {
    keys.add(alias);
  }
  return [...keys];
}

export function getPeriodStartAt(
  periodEndKey: string,
  config: CheckinConfig = getDefaultCheckinConfig(),
): Date {
  const normalized = normalizeBrazilDateKey(periodEndKey);
  if (!normalized) throw new Error(`Invalid period end key: ${periodEndKey}`);
  const startKey = addDaysToBrazilDateKey(normalized, -1);
  const [y, m, d] = startKey.split("-").map(Number);
  return resetInstantOnCalendarDay(y, m, d, config.resetHour);
}

/** Instant when the period ends and the next one begins (resetHour on the end civil day). */
export function getPeriodResetAt(
  periodEndKey: string,
  config: CheckinConfig = getDefaultCheckinConfig(),
): Date {
  const normalized = normalizeBrazilDateKey(periodEndKey);
  if (!normalized) throw new Error(`Invalid period end key: ${periodEndKey}`);
  const [y, m, d] = normalized.split("-").map(Number);
  return resetInstantOnCalendarDay(y, m, d, config.resetHour);
}

export function getCheckinPeriodForEndKey(
  periodEndKey: string,
  config: CheckinConfig = getDefaultCheckinConfig(),
): CheckinPeriod {
  const dateKey = normalizeBrazilDateKey(periodEndKey);
  if (!dateKey) throw new Error(`Invalid period end key: ${periodEndKey}`);
  const nextResetAt = getPeriodResetAt(dateKey, config);
  const startsAt = getPeriodStartAt(dateKey, config);
  const endsAt = new Date(nextResetAt.getTime() - 1000);
  return {
    dateKey,
    startsAt,
    endsAt,
    nextResetAt,
    timezone: config.timezone,
    resetHour: config.resetHour,
  };
}

export function getCurrentCheckinPeriod(
  now: Date = new Date(),
  config: CheckinConfig = getDefaultCheckinConfig(),
): CheckinPeriod {
  const dateKey = getCheckinPeriodEndKey(now, config);
  return getCheckinPeriodForEndKey(dateKey, config);
}

export function isCheckinLogInCurrentPeriod(
  logDateKey: string,
  period: CheckinPeriod = getCurrentCheckinPeriod(),
): boolean {
  return isSameCheckinPeriod(logDateKey, period.dateKey);
}

export function getGraceEndsAt(periodEndKey: string, config: CheckinConfig = getDefaultCheckinConfig()): Date {
  const resetAt = getPeriodResetAt(periodEndKey, config);
  const graceMs = config.graceHours * 3600000;
  return new Date(resetAt.getTime() + graceMs);
}

export function isWithinGraceForPeriod(
  periodEndKey: string,
  now: Date = new Date(),
  config: CheckinConfig = getDefaultCheckinConfig(),
): boolean {
  if (config.graceHours <= 0) return false;
  const end = getGraceEndsAt(periodEndKey, config);
  return now.getTime() <= end.getTime();
}

export function getNextResetAt(now: Date = new Date(), config: CheckinConfig = getDefaultCheckinConfig()): Date {
  return getCurrentCheckinPeriod(now, config).nextResetAt;
}

/** Whether a confirmed check-in exists for this period end key in a set of stored keys. */
export function periodHasConfirmedKey(storedKeys: Iterable<string>, periodEndKey: string): boolean {
  for (const raw of storedKeys) {
    if (isSameCheckinPeriod(raw, periodEndKey)) return true;
  }
  return false;
}
