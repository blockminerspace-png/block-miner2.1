export type MiningMode = "NORMAL" | "TURBO";

export type V1GpuAvailabilityResult = {
  success: boolean;
  data: unknown[];
  count: number;
};

export type V1ClaimResult = {
  id: number;
  userId: number;
  rewardId: number;
  gpuHashRate: number;
  isClaimed: boolean;
  claimedAt: Date | null;
  expiresAt: Date | null;
};

export type V1ActiveRewardStats = {
  claims24h: number;
  hash24h: number;
  claimsTotal: number;
  hashTotal: number;
  dailyLimit: number;
};

export type ReleasedGpuAdminRow = {
  id: number;
  username: string | null;
  name: string | null;
  gpu_hash_rate: number;
  is_available: number;
  is_claimed: number;
};

export type GpuSystemReport = {
  total_released: number;
  total_hash_rate_released: number;
  total_claimed: number;
  total_claimed_hash_rate: number;
  total_pending: number;
  total_pending_hash_rate: number;
  users_with_gpu: number;
};
