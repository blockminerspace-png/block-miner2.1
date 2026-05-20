import { Prisma, type FaucetClaim } from "@prisma/client";
import type { Request } from "express";
import prisma from "../../src/db/prisma.js";
import { getBrazilCheckinDateKey } from "../../utils/checkinDate.js";
import { createInventoryWithOwnedMachineTx } from "../../services/userOwnedMachineService.js";
import loggerLib, { logUserActivity } from "../../utils/logger.js";
import { logSecurityEvent } from "../../utils/securityLogger.js";
import { normalizePersistableMinerImageUrl } from "../../utils/ownedMachineImage.js";
import { FAUCET_ERROR } from "./faucet.errors.js";
import { buildNoRewardStatusResponse, buildStatusCore, mapPublicReward } from "./faucet.dto.js";
import type { FaucetPartnerState, FaucetRewardInfo } from "./faucet.types.js";
import * as faucetRepository from "./faucet.repository.js";

const faucetLogger = loggerLib.child("Faucet");
export const DEFAULT_FAUCET_COOLDOWN_MS = 60 * 60 * 1000;
export const FAUCET_PARTNER_WAIT_MS = 10_000;
export const FAUCET_PARTNER_URL = String(process.env.FAUCET_PARTNER_URL || "https://faucetpay.io/").trim();

export async function getActiveReward(): Promise<FaucetRewardInfo | null> {
  const reward = await faucetRepository.findActiveFaucetReward();
  
  const now = new Date();
  const fakeMiner = {
    id: 999999,
    name: "Faucet Boost 10 H/s",
    baseHashRate: 10,
    slotSize: 0,
    imageUrl: "/machines/reward1.png",
    isActive: true,
    price: new Prisma.Decimal(0),
    currency: "pol",
    createdAt: now,
    updatedAt: now,
    sellPrice: new Prisma.Decimal(0),
    requiredLevel: 1,
    minWithdrawalOverride: null,
    inventoryPermanent: false,
    durationHours: 24,
  } as any;

  return {
    rewardId: reward?.id || 1,
    cooldownMs: reward?.cooldownMs || DEFAULT_FAUCET_COOLDOWN_MS,
    miner: fakeMiner,
  };
}

export async function normalizeFaucetRecord(
  userId: number,
  record: FaucetClaim | null,
): Promise<{ record: FaucetClaim | null; todayKey: string }> {
  const todayKey = getBrazilCheckinDateKey();
  if (!record) return { record: null, todayKey };
  if (record.dayKey === todayKey) return { record, todayKey };

  const updated = await faucetRepository.resetFaucetClaimDayKey(userId, todayKey);
  return { record: updated, todayKey };
}

export function computePartnerState(
  record: FaucetClaim | null,
  visit: { openedAt: Date | null; eligibleAt: Date | null } | null,
  now: Date,
): FaucetPartnerState {
  const lastClaimAt = record?.claimedAt?.getTime() || 0;
  const visitOpenedAt = visit?.openedAt?.getTime() || 0;
  const visitEligibleAt = visit?.eligibleAt?.getTime() || 0;
  const hasFreshVisit = visitOpenedAt > 0 && visitOpenedAt > lastClaimAt;
  const waitRemainingMs = hasFreshVisit ? Math.max(0, visitEligibleAt - now.getTime()) : 0;
  const partnerReady = hasFreshVisit && waitRemainingMs === 0;
  return { hasFreshVisit, waitRemainingMs, partnerReady };
}

export async function startPartnerVisitForUser(userId: number, req: Request) {
  const now = new Date();
  const todayKey = getBrazilCheckinDateKey();
  const eligibleAt = new Date(now.getTime() + FAUCET_PARTNER_WAIT_MS);

  await faucetRepository.upsertFaucetPartnerVisit(userId, todayKey, now, eligibleAt);
  logUserActivity("FAUCET_PARTNER_VISIT_STARTED", req, {
    userId,
    dayKey: todayKey,
    eligibleAt: eligibleAt.toISOString(),
  });

  return {
    ok: true as const,
    partnerUrl: FAUCET_PARTNER_URL,
    waitMs: FAUCET_PARTNER_WAIT_MS,
    eligibleAt: eligibleAt.getTime(),
  };
}

export async function getStatusForUser(userId: number) {
  const record = await faucetRepository.findFaucetClaimByUserId(userId);
  const reward = await getActiveReward();

  if (!reward) {
    return buildNoRewardStatusResponse();
  }

  const normalized = await normalizeFaucetRecord(userId, record);
  const now = new Date();
  const payload = buildStatusCore(normalized.record, now, reward.cooldownMs);

  const visit = await faucetRepository.findFaucetPartnerVisit(userId, normalized.todayKey);
  const partner = computePartnerState(normalized.record, visit, now);

  return {
    ok: true as const,
    ...payload,
    canClaim: Boolean(payload.available && partner.partnerReady),
    reward: mapPublicReward(reward),
  };
}

export type FaucetClaimResult =
  | { ok: true; message: string; nextAvailableAt: number }
  | { ok: false; code: string; status: number; message: string; remainingMs?: number };

export async function claimForUser(userId: number, req: Request): Promise<FaucetClaimResult> {
  const now = new Date();
  const reward = await getActiveReward();
  if (!reward) {
    return {
      ok: false,
      code: FAUCET_ERROR.REWARD_NOT_CONFIGURED,
      status: 500,
      message: "Faucet reward not configured.",
    };
  }

  const record = await faucetRepository.findFaucetClaimByUserId(userId);
  const normalized = await normalizeFaucetRecord(userId, record);
  const status = buildStatusCore(normalized.record, now, reward.cooldownMs);

  if (!status.available) {
    return {
      ok: false,
      code: FAUCET_ERROR.COOLDOWN_ACTIVE,
      status: 429,
      message: "Cooldown active.",
      remainingMs: status.remainingMs,
    };
  }

  const visit = await faucetRepository.findFaucetPartnerVisit(userId, normalized.todayKey);
  const partner = computePartnerState(normalized.record, visit, now);

  if (!partner.partnerReady) {
    return {
      ok: false,
      code: FAUCET_ERROR.PARTNER_INCOMPLETE,
      status: 403,
      message: "Visita ao parceiro incompleta ou tempo mínimo não atingido.",
    };
  }

  const miner = reward.miner;

  async function getOrCreateFaucetGameId(tx: Prisma.TransactionClient): Promise<number> {
    const slug = "faucet_power";
    const existing = await tx.game.findUnique({ where: { slug } });
    if (existing) return existing.id;
    const g = await tx.game.create({
      data: { name: "Faucet Temporary Boost", slug, isActive: true }
    });
    return g.id;
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (miner.id === 999999) {
      const gameId = await getOrCreateFaucetGameId(tx);
      const playedAt = now;
      const expiresAt = new Date(playedAt.getTime() + 24 * 60 * 60 * 1000);
      await tx.userPowerGame.create({
        data: {
          userId,
          gameId,
          hashRate: miner.baseHashRate,
          playedAt,
          expiresAt
        }
      });
    } else {
      await createInventoryWithOwnedMachineTx(tx, {
        userId,
        minerId: miner.id,
        minerName: miner.name,
        level: 1,
        hashRate: miner.baseHashRate,
        slotSize: miner.slotSize,
        imageUrl: normalizePersistableMinerImageUrl(miner.imageUrl),
        acquiredAt: now,
        updatedAt: now,
      });
    }

    await tx.faucetClaim.upsert({
      where: { userId },
      update: { claimedAt: now, totalClaims: { increment: 1 }, dayKey: normalized.todayKey },
      create: { userId, claimedAt: now, totalClaims: 1, dayKey: normalized.todayKey },
    });
  });

  if (miner.id === 999999) {
    faucetLogger.info("Faucet temporary power reward created", {
      userId,
      hashRate: miner.baseHashRate,
      durationHours: 24,
    });
    logUserActivity("FAUCET_CLAIM_SUCCESS", req, {
      userId,
      rewardType: "TEMPORARY_POWER",
      hashRate: miner.baseHashRate,
      durationHours: 24,
      dayKey: normalized.todayKey,
    });
    return {
      ok: true,
      message: `Sucesso! Poder de mineração temporário de ${miner.baseHashRate} H/s ativado por 24 horas.`,
      nextAvailableAt: now.getTime() + reward.cooldownMs,
    };
  }

  faucetLogger.info("Faucet inventory reward created (permanent, no expiresAt)", {
    userId,
    minerId: miner.id,
    minerName: miner.name,
    inventoryExpiresAt: null,
  });
  logSecurityEvent(
    "faucet_inventory_reward_created",
    { userId, minerId: miner.id, inventoryPermanent: true, inventoryExpiresAt: null },
    req,
  );
  logUserActivity("FAUCET_CLAIM_SUCCESS", req, {
    userId,
    minerId: miner.id,
    minerName: miner.name,
    hashRate: Number(miner.baseHashRate || 0),
    slotSize: Number(miner.slotSize || 1),
    dayKey: normalized.todayKey,
  });

  return {
    ok: true,
    message: `Claim successful! ${miner.name} added.`,
    nextAvailableAt: now.getTime() + reward.cooldownMs,
  };
}
