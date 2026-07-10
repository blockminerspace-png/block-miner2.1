import { useQuery } from '@tanstack/react-query';
import {
  fetchEarningsStats,
  type UserEarningsPayload,
} from '../../pages/stats/stats.earnings.api';
import type { EarningsUiFilter } from '../../pages/stats/stats.config';
import { utcDateKey } from '../utils/utcStatsPeriod';
import { useAuthStore } from '../../store/auth';

/** Include UTC day in cache key so charts refresh at UTC midnight, not local midnight. */
export function earningsQueryKey(filter: EarningsUiFilter) {
  return ['stats', 'earnings', filter, utcDateKey()] as const;
}

export function useUserEarningsStats(filter: EarningsUiFilter = '30d') {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery<UserEarningsPayload, Error>({
    queryKey: earningsQueryKey(filter),
    queryFn: () => fetchEarningsStats(filter),
    refetchInterval: 60_000,
    enabled: isAuthenticated,
  });
}
