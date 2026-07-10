/** Client mirror of server/shared/utc — calendar math always UTC. */

export function utcToday(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function utcStartOfDayMs(now = new Date()): number {
  const [y, m, d] = utcToday(now).split("-").map(Number);
  return Date.UTC(y, m - 1, d, 0, 0, 0, 0);
}

export function msUntilUtcReset(now = new Date()): number {
  const next = utcStartOfDayMs(now) + 86_400_000;
  return Math.max(0, next - now.getTime());
}

export function formatUtcResetCountdown(totalMs: number): string {
  const totalSec = Math.max(0, Math.ceil(totalMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}
