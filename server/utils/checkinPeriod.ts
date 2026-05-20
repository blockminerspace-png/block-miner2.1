import {
  addDaysToBrazilDateKey,
  getBrazilCheckinDateKey,
  normalizeBrazilDateKey,
} from "./checkinDate.js";
import { getCheckinGraceHours, getCheckinResetHour } from "../modules/checkin/checkin.config.js";

const BRAZIL_TZ = "America/Sao_Paulo";

function getBrazilHourMinute(now: Date): { hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: BRAZIL_TZ,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour, minute };
}

/**
 * Daily check-in period key (YYYY-MM-DD). Before reset hour BRT, still counts as previous calendar day period.
 */
export function getCheckinPeriodKey(now: Date = new Date(), resetHour = getCheckinResetHour()): string {
  const calendarKey = getBrazilCheckinDateKey(now);
  const { hour } = getBrazilHourMinute(now);
  if (hour < resetHour) {
    return addDaysToBrazilDateKey(calendarKey, -1);
  }
  return calendarKey;
}

/** Instant when a period ends (reset hour BRT on the calendar day after periodKey). */
export function getPeriodResetAt(periodKey: string, resetHour = getCheckinResetHour()): Date {
  const normalized = normalizeBrazilDateKey(periodKey);
  if (!normalized) throw new Error(`Invalid period key: ${periodKey}`);
  const endKey = addDaysToBrazilDateKey(normalized, 1);
  const [y, m, d] = endKey.split("-").map(Number);
  let utcHour = resetHour + 3;
  let day = d;
  let month = m;
  let year = y;
  if (utcHour >= 24) {
    utcHour -= 24;
    const carry = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0));
    year = carry.getUTCFullYear();
    month = carry.getUTCMonth() + 1;
    day = carry.getUTCDate();
  }
  return new Date(Date.UTC(year, month - 1, day, utcHour, 0, 0));
}

export function getGraceEndsAt(periodKey: string): Date {
  const resetAt = getPeriodResetAt(periodKey);
  const graceMs = getCheckinGraceHours() * 3600000;
  return new Date(resetAt.getTime() + graceMs);
}

export function isWithinGraceForPeriod(periodKey: string, now: Date = new Date()): boolean {
  if (getCheckinGraceHours() <= 0) return false;
  const end = getGraceEndsAt(periodKey);
  return now.getTime() <= end.getTime();
}

export function getNextResetAt(now: Date = new Date()): Date {
  const current = getCheckinPeriodKey(now);
  return getPeriodResetAt(current);
}
