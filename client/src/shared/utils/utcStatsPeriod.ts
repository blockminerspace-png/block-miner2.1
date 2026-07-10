export type EarningsUiFilter = "today" | "7d" | "30d" | "90d" | "all";

export function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export function endOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

export function resolveEarningsWindow(filter: EarningsUiFilter, now = new Date()) {
  const toUtc = endOfUtcDay(now);
  if (filter === "all") return { fromUtc: null as Date | null, toUtc };
  if (filter === "today") return { fromUtc: startOfUtcDay(now), toUtc };
  const days = filter === "7d" ? 7 : filter === "30d" ? 30 : 90;
  const fromUtc = startOfUtcDay(now);
  fromUtc.setUTCDate(fromUtc.getUTCDate() - (days - 1));
  return { fromUtc, toUtc };
}

export function formatUtcCsvDay(dateKey: string): string {
  return `${dateKey} 00:00:00 UTC`;
}

export function formatUtcChartDay(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = months[(m ?? 1) - 1] ?? dateKey;
  return `${String(d).padStart(2, "0")} ${mon} UTC`;
}
