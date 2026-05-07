import { useCallback, useEffect, useRef, useState } from 'react';

const STATS_POLL_MS = 30_000;
const STATS_FETCH_MS = 10_000;

/** Shape returned by `GET /api/public-stats` when `ok: true`. */
export type PublicStatsPayload = {
  ok: true;
  users?: number;
  activeMiners?: number;
  totalWithdrawn?: number;
  launchDate?: string;
};

/**
 * Polls `/api/public-stats` for the landing trust strip + community section.
 * Aborts slow responses, skips overlap, pauses while the tab is hidden.
 */
export function usePublicStatsPoll(): PublicStatsPayload | null {
  const [publicStats, setPublicStats] = useState<PublicStatsPayload | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  const loadStats = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const killTimer = window.setTimeout(() => ac.abort(), STATS_FETCH_MS);
    fetch('/api/public-stats', { signal: ac.signal, credentials: 'same-origin' })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean } & Partial<PublicStatsPayload>;
        if (!res.ok || !data?.ok) return;
        setPublicStats(data as PublicStatsPayload);
      })
      .catch(() => {})
      .finally(() => {
        window.clearTimeout(killTimer);
        inFlightRef.current = false;
      });
  }, []);

  useEffect(() => {
    loadStats();
    const tick = () => {
      if (document.visibilityState === 'visible') loadStats();
    };
    const id = window.setInterval(tick, STATS_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      abortRef.current?.abort();
    };
  }, [loadStats]);

  return publicStats;
}
