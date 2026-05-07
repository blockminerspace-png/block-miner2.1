import type { DashboardBlockRow, DashboardGameStats } from './dashboardStats';

/** Miner slice from `state:update` / `getPublicState` (server-sanitized). */
export type MiningSocketMiner = NonNullable<DashboardGameStats['miner']> & {
  id?: string;
  username?: string;
  walletAddress?: string | null;
  rigs?: number;
  active?: boolean;
  lifetimeMined?: number;
  connected?: boolean;
  refCode?: string | null;
  boostMultiplier?: number;
  baseHashRate?: number;
  activeTemporaryHashRate?: number;
};

/** Public mining payload pushed over Socket.IO. */
export type MiningSocketStats = Omit<DashboardGameStats, 'miner'> & {
  serverTime?: number;
  tokenPrice?: number;
  blockReward?: number;
  blockIntervalMinutes?: number;
  blockNumber?: number;
  blockProgress?: number;
  totalMiners?: number;
  activeMiners?: number;
  totalMinted?: number;
  lastReward?: number;
  blockHistory?: DashboardBlockRow[];
  miner?: MiningSocketMiner | null;
  leaderboard?: unknown[];
};
