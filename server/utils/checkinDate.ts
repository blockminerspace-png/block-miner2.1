const BRAZIL_TIME_ZONE = "America/Sao_Paulo";
const BRAZIL_DAY_FORMATTER = new Intl.DateTimeFormat("en-CA-u-ca-iso8601", {
  timeZone: BRAZIL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function pad2(value) {
  return String(value).padStart(2, "0");
}

function buildNormalizedBrazilDateKey(year, month, day) {
  return `${String(year)}-${pad2(month)}-${pad2(day)}`;
}

function formatBrazilDateParts(date) {
  const parts = BRAZIL_DAY_FORMATTER.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Unable to format Brazil calendar date.");
  }
  return { year, month, day };
}

/**
 * Legacy deployments have produced more than one textual shape for the same Brazil day.
 * Normalize them to a single YYYY-MM-DD key before comparing streaks or loading today's row.
 */
export function normalizeBrazilDateKey(input) {
  if (input instanceof Date) {
    return getBrazilCheckinDateKey(input);
  }

  if (typeof input !== "string") return "";
  const raw = input.trim();
  if (!raw) return "";

  const ymdDash = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (ymdDash) {
    return buildNormalizedBrazilDateKey(ymdDash[1], ymdDash[2], ymdDash[3]);
  }

  const ymdSlash = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[T\s].*)?$/);
  if (ymdSlash) {
    return buildNormalizedBrazilDateKey(ymdSlash[1], ymdSlash[2], ymdSlash[3]);
  }

  const mdySlash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[T\s].*)?$/);
  if (mdySlash) {
    return buildNormalizedBrazilDateKey(mdySlash[3], mdySlash[1], mdySlash[2]);
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return getBrazilCheckinDateKey(parsed);
  }

  return "";
}

/** Calendar date in America/Sao_Paulo (same semantics as streak math in addDaysToBrazilDateKey). */
export function getBrazilCheckinDateKey(date = new Date()) {
  const { year, month, day } = formatBrazilDateParts(date);
  return `${year}-${month}-${day}`;
}

/**
 * Textual aliases that have appeared for the same Brazil calendar day.
 * Reads use this to prevent legacy rows from breaking streaks or today's status.
 * @param {Date|string} [input]
 */
export function getBrazilDateKeyAliases(input: Date | string = new Date()): string[] {
  const normalized = normalizeBrazilDateKey(input);
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
      `${m}/${d}/${year}`
    ])
  );
}

/** Calendar day in America/Sao_Paulo, offset by whole days (streak math). */
export function addDaysToBrazilDateKey(dateKey, deltaDays) {
  const normalized = normalizeBrazilDateKey(dateKey);
  if (!normalized) {
    throw new Error(`Invalid Brazil date key: ${String(dateKey)}`);
  }
  const [Y, M, D] = normalized.split("-").map(Number);
  const noonBrUtc = new Date(Date.UTC(Y, M - 1, D, 15, 0, 0));
  const shifted = new Date(noonBrUtc.getTime() + Number(deltaDays) * 86400000);
  return getBrazilCheckinDateKey(shifted);
}

/** First day of calendar month in America/Sao_Paulo (YYYY-MM). */
export function getBrazilMonthPeriodKey(date = new Date()) {
  return getBrazilCheckinDateKey(date).slice(0, 7);
}

/**
 * ISO 8601 week label (YYYY-Www) for the Brazil calendar date of `date`.
 * Week boundaries follow ISO (Monday–Sunday); the week year may differ from the civil year.
 */
export function getBrazilIsoWeekPeriodKey(date = new Date()) {
  const key = getBrazilCheckinDateKey(date);
  const [y, m, d] = key.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  utc.setUTCDate(utc.getUTCDate() + 3 - ((utc.getUTCDay() + 6) % 7));
  const isoYear = utc.getUTCFullYear();
  const week1 = new Date(Date.UTC(isoYear, 0, 4));
  week1.setUTCDate(week1.getUTCDate() - ((week1.getUTCDay() + 6) % 7));
  const weekNo = 1 + Math.round((utc.getTime() - week1.getTime()) / 604800000);
  return `${isoYear}-W${String(weekNo).padStart(2, "0")}`;
}
