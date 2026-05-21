import type { FaucetClaim } from "@prisma/client";
import { normalizePersistableMinerImageUrl } from "../../utils/ownedMachineImage.js";
import type { FaucetRewardInfo, FaucetStatusCore } from "./faucet.types.js";

export function buildStatusCore(record: FaucetClaim | null, now: Date, cooldownMs: number): FaucetStatusCore {
  if (!record || !record.claimedAt) {
    return { available: true, remainingMs: 0, nextClaimAt: null, totalClaims: record?.totalClaims || 0 };
  }

  const nextClaimAt = new Date(record.claimedAt.getTime() + cooldownMs);
  const remainingMs = Math.max(0, nextClaimAt.getTime() - now.getTime());

  return {
    available: remainingMs === 0,
    remainingMs,
    nextClaimAt,
    totalClaims: record.totalClaims || 0,
  };
}

export function mapPublicReward(reward: FaucetRewardInfo) {
  return {
    id: reward.rewardId,
    minerId: reward.miner.id,
    name: reward.miner.name,
    hashRate: reward.miner.baseHashRate,
    slotSize: reward.miner.slotSize,
    imageUrl: normalizePersistableMinerImageUrl(reward.miner.imageUrl) ?? null,
    inventoryPermanent: reward.miner.id === 999999 ? false : ((reward.miner as any).inventoryPermanent ?? true),
    inventoryExpiresAt: null,
  };
}

export function buildNoRewardStatusResponse() {
  return {
    ok: true as const,
    available: false,
    message: "No faucet reward configured.",
    canClaim: false,
    reward: null,
  };
}
