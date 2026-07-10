export type EarningsPeriod = "today" | "7d" | "30d" | "90d" | "all";

export type UtcStatsWindow = {
  period: EarningsPeriod;
  fromUtc: Date | null;
  toUtc: Date;
};

export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export function endOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

export function msUntilNextUtcDay(now = new Date()): number {
  return Math.max(0, endOfUtcDay(now).getTime() + 1 - now.getTime());
}

export function parseEarningsPeriod(raw: unknown): EarningsPeriod {
  const p = String(raw ?? "30d").trim().toLowerCase();
  if (p === "today" || p === "7d" || p === "30d" || p === "90d" || p === "all") return p;
  return "30d";
}

export function resolveEarningsWindow(period: EarningsPeriod, now = new Date()): UtcStatsWindow {
  const toUtc = endOfUtcDay(now);
  if (period === "all") {
    return { period, fromUtc: null, toUtc };
  }
  if (period === "today") {
    return { period, fromUtc: startOfUtcDay(now), toUtc };
  }
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const fromUtc = startOfUtcDay(now);
  fromUtc.setUTCDate(fromUtc.getUTCDate() - (days - 1));
  return { period, fromUtc, toUtc };
}

export function parseUtcStatsWindow(query: {
  period?: unknown;
  fromUtc?: unknown;
  toUtc?: unknown;
}): UtcStatsWindow {
  const fromRaw = query.fromUtc != null ? String(query.fromUtc).trim() : "";
  const toRaw = query.toUtc != null ? String(query.toUtc).trim() : "";
  if (fromRaw || toRaw) {
    const now = new Date();
    const toUtc = toRaw ? endOfUtcDay(new Date(toRaw)) : endOfUtcDay(now);
    const fromUtc = fromRaw ? startOfUtcDay(new Date(fromRaw)) : null;
    return { period: "all", fromUtc, toUtc };
  }
  const period = parseEarningsPeriod(query.period);
  return resolveEarningsWindow(period);
}
