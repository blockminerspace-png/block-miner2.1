import { useEffect, useMemo, useState } from 'react';

export function useDecountingSeconds(serverSeconds: number | null | undefined): number | null {
  const [v, setV] = useState<number | null>(serverSeconds ?? null);
  useEffect(() => {
    setV(serverSeconds ?? null);
  }, [serverSeconds]);
  useEffect(() => {
    if (v == null || v <= 0) return undefined;
    const id = setInterval(() => setV((x) => (x != null && x > 0 ? x - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [v, serverSeconds]);
  return v;
}

export function useElapsedSeconds(startedAtIso: string, active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [startedAtIso, active]);
  return useMemo(() => {
    if (!active) return 0;
    try {
      const started = new Date(startedAtIso).getTime();
      return Math.max(0, (Date.now() - started) / 1000);
    } catch {
      return 0;
    }
  }, [startedAtIso, active, tick]);
}
