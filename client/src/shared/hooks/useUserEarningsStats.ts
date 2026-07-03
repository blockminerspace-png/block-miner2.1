import { useQuery } from '@tanstack/react-query';
import {
  fetchEarningsStats,
  type EarningsPeriod,
  type UserEarningsPayload,
} from '../../pages/stats/stats.earnings.api';

export function earningsQueryKey(period: EarningsPeriod) {
  return ['stats', 'earnings', period] as const;
}

export function useUserEarningsStats(period: EarningsPeriod = '30d') {
  return useQuery<UserEarningsPayload, Error>({
    queryKey: earningsQueryKey(period),
    queryFn: () => fetchEarningsStats(period),
    refetchInterval: 60_000,
  });
}
