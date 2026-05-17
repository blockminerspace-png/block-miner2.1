import { useRef, useCallback } from 'react';

/**
 * Prevents overlapping execution of an async handler (e.g. double submit while awaiting axios).
 */
export function useAsyncActionGuard() {
  const inFlight = useRef(false);
  return useCallback((fn: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    void (async () => {
      try {
        await fn();
      } finally {
        inFlight.current = false;
      }
    })();
  }, []);
}
