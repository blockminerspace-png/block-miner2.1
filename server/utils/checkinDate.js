/** Calendar date in America/Sao_Paulo (same semantics as streak math in addDaysToBrazilDateKey). */
export function getBrazilCheckinDateKey(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Calendar day in America/Sao_Paulo, offset by whole days (streak math). */
export function addDaysToBrazilDateKey(dateKey, deltaDays) {
  const [Y, M, D] = dateKey.split("-").map(Number);
  const noonBrUtc = new Date(Date.UTC(Y, M - 1, D, 15, 0, 0));
  const shifted = new Date(noonBrUtc.getTime() + Number(deltaDays) * 86400000);
  return shifted.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
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
