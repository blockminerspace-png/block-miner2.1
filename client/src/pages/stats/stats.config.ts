export const STATS_TABS = [
  'summary',
  'earnings',
  'power',
  'machines',
  'boosts',
  'network',
  'history',
  'tools',
] as const;

export type StatsTabId = (typeof STATS_TABS)[number];

export const EARNINGS_CATEGORY_KEYS = [
  'mining',
  'offerwall',
  'faucet',
  'shortlinks',
  'autoMining',
  'games',
  'youtube',
  'checkin',
  'referrals',
] as const;

export type EarningsCategoryKey = (typeof EARNINGS_CATEGORY_KEYS)[number];

export type EarningsUiFilter = 'today' | '7d' | '30d' | '90d' | 'all';

export function earningsFilterToApiPeriod(filter: EarningsUiFilter): EarningsUiFilter {
  return filter;
}

export type BoostFilter = 'all' | 'games' | 'youtube' | 'autoMining' | 'faucet' | 'checkin';
