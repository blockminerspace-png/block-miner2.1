import { api } from '../../store/auth';

export interface PowerStatsHistory {
  miningLogByDay?: Array<{ date: string; avgSharePercent?: number }>;
  blkCycles?: Array<{ windowStart?: string; totalHashrate?: number }>;
}

export interface UserPowerStatsPayload {
  ok?: boolean;
  message?: string;
  overview?: {
    totalHashrate?: number;
    permanentHashrate?: number;
    temporaryHashrate?: number;
    permanentPercent?: number;
    temporaryPercent?: number;
    breakdown?: {
      machines?: number;
      gamesMinigame?: number;
      gamesCheckin?: number;
      youtube?: number;
      autoMining?: number;
    };
    nextExpirations?: Array<{
      source: string;
      slug: string;
      name: string;
      hashRate?: number;
      expiresAt?: string | null;
      playedAt?: string | null;
    }>;
  };
  history?: PowerStatsHistory;
  projections?: { hintKeys?: string[] };
  machines?: {
    activeCount?: number;
    inactiveCount?: number;
    items?: Array<{
      id: string | number;
      minerName?: string;
      hashRate?: number;
      isActive?: boolean;
      roomNumber?: number | null;
      rackPosition?: string | null;
    }>;
  };
  youtube?: {
    activeTotal?: number;
    activeItems?: Array<{
      id: string | number;
      sourceVideoId?: string | null;
      hashRate?: number;
      expiresAt?: string | null;
    }>;
    history?: Array<{
      id: string | number;
      sourceVideoId?: string | null;
      hashRate?: number;
    }>;
  };
  games?: {
    minigameTotal?: number;
    checkinBonusTotal?: number;
    byGame?: Array<{
      slug: string;
      name: string;
      totalHashRate?: number;
      items: Array<{
        id: string | number;
        expiresAt?: string | null;
        hashRate?: number;
      }>;
    }>;
  };
  autoMining?: {
    total?: number;
    items?: Array<{
      id: string | number;
      gpuHashRate?: number;
      expiresAt?: string | null;
    }>;
  };
  checkin?: {
    streak?: number;
    nextHashrateMilestones?: Array<{
      dayThreshold: number;
      rewardValue: number | string;
      validityDays?: number;
      displayTitle?: string | null;
    }>;
  };
  network?: {
    userRank?: number | null;
    totalRankedUsers?: number | null;
    activeUsersLast24h?: number;
    lastBlkCycle?: { totalHashrate?: number; minerCount?: number } | null;
    blkPoolSharePercent?: number | null;
    blkPaused?: boolean;
  };
  payout?: {
    rows?: Array<{ key: string; labelKey: string; percent: number; noteKey: string }>;
  };
  analytics?: {
    miningLogPeakShare?: number;
    miningLogAvgShare?: number;
    miningLogSamples?: number;
  };
}

/** GET /api/stats/power — estatísticas consolidadas de poder (read-only). */
export async function fetchPowerStatsEnvelope(): Promise<UserPowerStatsPayload> {
  const res = await api.get<UserPowerStatsPayload>('/stats/power');
  return res.data;
}
