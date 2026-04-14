import { useState, useEffect, useCallback } from 'react';
import { api } from '../store/auth';

/**
 * Fetches consolidated power statistics (read-only). Polls periodically for expiry accuracy.
 * @param {number} [pollMs] default 45s
 */
export function useUserPowerStats(pollMs = 45000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get('/stats/power');
      if (res.data?.ok) {
        setData(res.data);
      } else {
        setError(new Error(res.data?.message || 'Failed to load power statistics'));
      }
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!pollMs || pollMs < 5000) return undefined;
    const id = setInterval(fetchData, pollMs);
    return () => clearInterval(id);
  }, [fetchData, pollMs]);

  return { data, loading, error, refetch: fetchData };
}
