import type { UserPowerStatsPayload } from './stats.api';
import type { UserEarningsPayload } from './stats.earnings.api';
import type { EarningsUiFilter, StatsTabId } from './stats.config';

export type StatsDashboardContext = {
  power: UserPowerStatsPayload;
  earnings: UserEarningsPayload | undefined;
  earningsLoading: boolean;
  earningsFilter: EarningsUiFilter;
  setEarningsFilter: (f: EarningsUiFilter) => void;
  ratioBar: { p: number; tmp: number };
  onNavigateTab: (tab: StatsTabId) => void;
};
