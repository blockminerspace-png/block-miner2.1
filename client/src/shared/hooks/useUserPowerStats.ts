import { useState, useEffect, useCallback } from 'react';
import {
  fetchPowerStatsEnvelope,
  type UserPowerStatsPayload,
} from '../../pages/stats/stats.api';

/**
 * Fetches consolidated power statistics (read-only). Polls periodically for expiry accuracy.
 */
export function useUserPowerStats(pollMs = 45000) {
  const [data, setData] = useState<UserPowerStatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchPowerStatsEnvelope();
      if (res?.ok) {
        setData(res);
      } else {
        setError(new Error(res?.message || 'Failed to load power statistics'));
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to load power statistics'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!pollMs || pollMs < 5000) return undefined;
    const id = setInterval(() => {
      void fetchData();
    }, pollMs);
    return () => clearInterval(id);
  }, [fetchData, pollMs]);

  return { data, loading, error, refetch: fetchData };
}
