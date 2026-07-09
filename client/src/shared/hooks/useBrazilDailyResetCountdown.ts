import { useEffect, useState } from "react";

const BRAZIL_TZ = "America/Sao_Paulo";

function brazilDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BRAZIL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function msUntilNextBrazilReset(now = new Date()): number {
  const today = brazilDateKey(now);
  let lo = now.getTime();
  let hi = now.getTime() + 50 * 3600000;
  while (hi - lo > 2) {
    const mid = Math.floor((lo + hi) / 2);
    if (brazilDateKey(new Date(mid)) === today) lo = mid;
    else hi = mid;
  }
  return Math.max(0, hi - now.getTime());
}

export function formatBrazilResetCountdown(totalMs: number): string {
  const totalSec = Math.max(0, Math.ceil(totalMs / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

/** Live countdown to the next midnight in America/Sao_Paulo. */
export function useBrazilDailyResetCountdown(initialMs?: number) {
  const [remainingMs, setRemainingMs] = useState(() =>
    initialMs != null && initialMs >= 0 ? initialMs : msUntilNextBrazilReset(),
  );

  useEffect(() => {
    if (initialMs != null && initialMs >= 0) setRemainingMs(initialMs);
  }, [initialMs]);

  useEffect(() => {
    const tick = () => setRemainingMs(msUntilNextBrazilReset());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return { remainingMs, label: formatBrazilResetCountdown(remainingMs) };
}
