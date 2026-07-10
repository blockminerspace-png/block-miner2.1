import { useEffect, useState } from "react";
import { formatUtcResetCountdown, msUntilUtcReset } from "../utils/utc";

/** Live countdown to the next 00:00 UTC reset. */
export function useUtcDailyResetCountdown(initialMs?: number) {
  const [remainingMs, setRemainingMs] = useState(() =>
    initialMs != null && initialMs >= 0 ? initialMs : msUntilUtcReset(),
  );

  useEffect(() => {
    if (initialMs != null && initialMs >= 0) setRemainingMs(initialMs);
  }, [initialMs]);

  useEffect(() => {
    const tick = () => setRemainingMs(msUntilUtcReset());
    tick();
    const id = window.setInterval(tick, 1000);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return { remainingMs, label: formatUtcResetCountdown(remainingMs) };
}

export { formatUtcResetCountdown };
