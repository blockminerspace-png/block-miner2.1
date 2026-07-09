import { useEffect, useState } from "react";

function msUntilNextUtcReset(now = new Date()): number {
  const utcToday = now.toISOString().slice(0, 10);
  const [y, m, d] = utcToday.split("-").map(Number);
  const next = Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0);
  return Math.max(0, next - now.getTime());
}

export function formatUtcResetCountdown(totalMs: number): string {
  const totalSec = Math.max(0, Math.ceil(totalMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

/** Live countdown to the next 00:00 UTC reset. */
export function useUtcDailyResetCountdown(initialMs?: number) {
  const [remainingMs, setRemainingMs] = useState(() =>
    initialMs != null && initialMs >= 0 ? initialMs : msUntilNextUtcReset(),
  );

  useEffect(() => {
    if (initialMs != null && initialMs >= 0) setRemainingMs(initialMs);
  }, [initialMs]);

  useEffect(() => {
    const tick = () => setRemainingMs(msUntilNextUtcReset());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return { remainingMs, label: formatUtcResetCountdown(remainingMs) };
}
