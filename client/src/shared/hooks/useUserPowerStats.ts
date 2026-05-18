import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchPowerStatsEnvelope,
  type UserPowerStatsPayload,
} from '../../pages/stats/stats.api';
import {
  readAxiosHttpStatus,
  readAxiosResponseMessage,
  shouldStopApiPolling,
} from '../utils/httpPollingGuard';

/**
 * Fetches consolidated power statistics (read-only). Polls periodically for expiry accuracy.
 * Stops polling after 401/500/503 until manual refetch.
 */
export function useUserPowerStats(pollMs = 45000) {
  const [data, setData] = useState<UserPowerStatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingEnabledRef = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetchPowerStatsEnvelope();
      if (res?.ok) {
        setData(res);
        setError(null);
        pollingEnabledRef.current = true;
      } else {
        setError(res?.message || 'Failed to load power statistics');
        pollingEnabledRef.current = false;
      }
    } catch (e: unknown) {
      const status = readAxiosHttpStatus(e);
      if (shouldStopApiPolling(status)) {
        pollingEnabledRef.current = false;
      }
      setError(readAxiosResponseMessage(e, 'Failed to load power statistics'));
    } finally {
      setLoading(false);
    }
  }, []);

  const refetch = useCallback(async () => {
    pollingEnabledRef.current = true;
    setLoading(true);
    await fetchData();
  }, [fetchData]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!pollMs || pollMs < 5000) return undefined;
    const id = setInterval(() => {
      if (!pollingEnabledRef.current) return;
      void fetchData();
    }, pollMs);
    return () => clearInterval(id);
  }, [fetchData, pollMs]);

  return { data, loading, error, refetch };
}
