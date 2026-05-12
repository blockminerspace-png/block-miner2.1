/**
 * Subset of mining/socket state consumed by the Dashboard page.
 * Server is authoritative; these types only guard the UI against malformed payloads.
 */
export type DashboardBlockRow = {
  blockNumber: number;
  userReward?: number | string | null;
  totalReward?: number | string | null;
  timestamp: string | number | Date;
  /** Server could not commit this round to Postgres; userReward stays 0. */
  persistFailed?: boolean;
};

export type DashboardMinerStats = {
  balance: number;
  estimatedHashRate: number;
  referralCount?: number;
};

export type DashboardGameStats = {
  miner?: DashboardMinerStats | null;
  networkHashRate?: number;
  tokenSymbol?: string;
  blockCountdownSeconds?: number;
  blockHistory?: DashboardBlockRow[];
};
