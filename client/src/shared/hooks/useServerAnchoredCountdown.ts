import { useEffect, useRef, useState } from "react";

type Options = {
  /** ISO instant when countdown reaches zero (server truth). */
  targetIso: string | null | undefined;
  /** Fallback duration in ms when no target (e.g. initial remainingMs from API). */
  fallbackMs?: number;
  /** Recompute on tab focus / visibility (recommended). */
  resyncOnVisible?: boolean;
  tickMs?: number;
};

/**
 * Server-anchored countdown: derives remaining time from a server-provided ISO deadline.
 * Skips ticks while the tab is hidden; snaps on visibility return.
 */
export function useServerAnchoredCountdown({
  targetIso,
  fallbackMs = 0,
  resyncOnVisible = true,
  tickMs = 1000,
}: Options) {
  const targetMsRef = useRef<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(() => {
    if (targetIso) {
      const t = new Date(targetIso).getTime();
      if (Number.isFinite(t)) return Math.max(0, t - Date.now());
    }
    return Math.max(0, fallbackMs);
  });

  useEffect(() => {
    if (targetIso) {
      const t = new Date(targetIso).getTime();
      targetMsRef.current = Number.isFinite(t) ? t : null;
    } else {
      targetMsRef.current = fallbackMs > 0 ? Date.now() + fallbackMs : null;
    }

    const tick = () => {
      if (resyncOnVisible && document.hidden) return;
      if (targetMsRef.current == null) {
        setRemainingMs(0);
        return;
      }
      setRemainingMs(Math.max(0, targetMsRef.current - Date.now()));
    };

    tick();
    const id = window.setInterval(tick, tickMs);

    const onVisible = () => {
      if (!document.hidden) tick();
    };
    if (resyncOnVisible) {
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("focus", onVisible);
    }

    return () => {
      window.clearInterval(id);
      if (resyncOnVisible) {
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("focus", onVisible);
      }
    };
  }, [targetIso, fallbackMs, resyncOnVisible, tickMs]);

  return { remainingMs, isComplete: remainingMs <= 0 };
}
