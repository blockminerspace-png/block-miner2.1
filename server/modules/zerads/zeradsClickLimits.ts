const MS_DAY = 24 * 60 * 60 * 1000;

/** Zerads PTC: max clicks per UTC calendar day (server timezone). */
export const ZERADS_MAX_CLICKS_PER_UTC_DAY = Math.max(
  1,
  parseInt(
    process.env.ZERADS_MAX_CLICKS_PER_UTC_DAY ??
      process.env.ZERADS_MAX_CLICKS_PER_BRT_DAY ??
      "100",
    10,
  ) || 100,
);

/** @deprecated alias */
export const ZERADS_MAX_CLICKS_PER_BRT_DAY = ZERADS_MAX_CLICKS_PER_UTC_DAY;

export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function utcDayBounds(dayKey: string): { start: Date; end: Date } {
  const start = new Date(`${dayKey}T00:00:00.000Z`);
  return { start, end: new Date(start.getTime() + MS_DAY) };
}

export function utcDayStart(anchor: Date): Date {
  const d = new Date(anchor);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function capZeradsClicksForUtcDay(clicks: number): number {
  return Math.min(Math.max(0, Math.trunc(clicks)), ZERADS_MAX_CLICKS_PER_UTC_DAY);
}

/** @deprecated */
export const capZeradsClicksForBrtDay = capZeradsClicksForUtcDay;

export type ZeradsClickTotals = { raw: number; credited: number };

/** Sum clicks per user with per-UTC-day cap — same rule as ingest. */
export function aggregateZeradsClicksPerUser(
  rows: { userId: number; callbackAt: Date; clicks: number }[],
): Map<number, ZeradsClickTotals> {
  const byUserDay = new Map<string, number>();
  for (const r of rows) {
    if (r.clicks <= 0) continue;
    const k = `${r.userId}|${utcDayKey(r.callbackAt)}`;
    byUserDay.set(k, (byUserDay.get(k) ?? 0) + r.clicks);
  }
  const out = new Map<number, ZeradsClickTotals>();
  for (const [k, dayClicks] of byUserDay) {
    const userId = Number(k.split("|")[0]);
    const prev = out.get(userId) ?? { raw: 0, credited: 0 };
    prev.raw += dayClicks;
    prev.credited += capZeradsClicksForUtcDay(dayClicks);
    out.set(userId, prev);
  }
  return out;
}
