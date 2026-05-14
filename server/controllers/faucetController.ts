import type { Request, Response } from "express";
import prisma from "../src/db/prisma.js";
import { getBrazilCheckinDateKey } from "../utils/checkinDate.js";
import { createInventoryWithOwnedMachineTx } from "../services/userOwnedMachineService.js";
import loggerLib, { logUserActivity } from "../utils/logger.js";
import { logSecurityEvent } from "../utils/securityLogger.js";
import type { FaucetClaim, Miner } from "@prisma/client";
import type { Prisma } from "@prisma/client";

const faucetLogger = loggerLib.child("Faucet");

const DEFAULT_MINER_IMAGE_URL = "/machines/reward1.png";
const DEFAULT_FAUCET_COOLDOWN_MS = 60 * 60 * 1000;
const FAUCET_PARTNER_WAIT_MS = 10_000;
const FAUCET_PARTNER_URL = String(process.env.FAUCET_PARTNER_URL || "https://faucetpay.io/").trim();

type RewardInfo = {
  rewardId: number;
  cooldownMs: number;
  miner: Miner;
};

async function getActiveReward(): Promise<RewardInfo | null> {
  const reward = await prisma.faucetReward.findFirst({
    where: { isActive: true },
    include: { miner: true },
    orderBy: { id: "asc" }
  });

  if (!reward?.miner) return null;

  return {
    rewardId: reward.id,
    cooldownMs: reward.cooldownMs || DEFAULT_FAUCET_COOLDOWN_MS,
    miner: reward.miner
  };
}

function buildStatusPayload(record: FaucetClaim | null, now: Date, cooldownMs: number) {
  if (!record || !record.claimedAt) {
    return { available: true, remainingMs: 0, nextClaimAt: null, totalClaims: record?.totalClaims || 0 };
  }

  const nextClaimAt = new Date(record.claimedAt.getTime() + cooldownMs);
  const remainingMs = Math.max(0, nextClaimAt.getTime() - now.getTime());

  return {
    available: remainingMs === 0,
    remainingMs,
    nextClaimAt,
    totalClaims: record.totalClaims || 0
  };
}

async function normalizeFaucetRecord(
  userId: number,
  record: FaucetClaim | null
): Promise<{ record: FaucetClaim | null; todayKey: string }> {
  const todayKey = getBrazilCheckinDateKey();
  if (!record) return { record: null, todayKey };
  if (record.dayKey === todayKey) return { record, todayKey };

  const updated = await prisma.faucetClaim.update({
    where: { userId },
    data: { totalClaims: 0, dayKey: todayKey }
  });

  return { record: updated, todayKey };
}

export async function startPartnerVisit(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const now = new Date();
    const todayKey = getBrazilCheckinDateKey();
    const eligibleAt = new Date(now.getTime() + FAUCET_PARTNER_WAIT_MS);

    await prisma.faucetPartnerVisit.upsert({
      where: { userId_dayKey: { userId: req.user.id, dayKey: todayKey } },
      update: { openedAt: now, eligibleAt, updatedAt: now },
      create: { userId: req.user.id, dayKey: todayKey, openedAt: now, eligibleAt }
    });
    logUserActivity("FAUCET_PARTNER_VISIT_STARTED", req, {
      userId: req.user.id,
      dayKey: todayKey,
      eligibleAt: eligibleAt.toISOString()
    });

    res.json({
      ok: true,
      partnerUrl: FAUCET_PARTNER_URL,
      waitMs: FAUCET_PARTNER_WAIT_MS,
      eligibleAt: eligibleAt.getTime()
    });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Error starting visit." });
  }
}

export async function getStatus(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const userId = req.user.id;
    const record = await prisma.faucetClaim.findUnique({ where: { userId } });
    const reward = await getActiveReward();

    if (!reward) {
      res.json({
        ok: true,
        available: false,
        message: "No faucet reward configured.",
        canClaim: false,
        reward: null
      });
      return;
    }

    const normalized = await normalizeFaucetRecord(userId, record);
    const now = new Date();
    const payload = buildStatusPayload(normalized.record, now, reward.cooldownMs);

    const visit = await prisma.faucetPartnerVisit.findUnique({
      where: { userId_dayKey: { userId, dayKey: normalized.todayKey } }
    });

    const lastClaimAt = normalized.record?.claimedAt?.getTime() || 0;
    const visitOpenedAt = visit?.openedAt?.getTime() || 0;
    const visitEligibleAt = visit?.eligibleAt?.getTime() || 0;
    const hasFreshVisit = visitOpenedAt > 0 && visitOpenedAt > lastClaimAt;
    const waitRemainingMs = hasFreshVisit ? Math.max(0, visitEligibleAt - now.getTime()) : 0;
    const partnerReady = hasFreshVisit && waitRemainingMs === 0;

    res.json({
      ok: true,
      ...payload,
      canClaim: Boolean(payload.available && partnerReady),
      reward: {
        id: reward.rewardId,
        minerId: reward.miner.id,
        name: reward.miner.name,
        hashRate: reward.miner.baseHashRate,
        slotSize: reward.miner.slotSize,
        imageUrl: reward.miner.imageUrl || DEFAULT_MINER_IMAGE_URL,
        inventoryPermanent: true,
        inventoryExpiresAt: null
      }
    });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Error loading status." });
  }
}

export async function claim(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const userId = req.user.id;
    const now = new Date();
    const reward = await getActiveReward();
    if (!reward) {
      res.status(500).json({ ok: false, message: "Faucet reward not configured." });
      return;
    }

    const record = await prisma.faucetClaim.findUnique({ where: { userId } });
    const normalized = await normalizeFaucetRecord(userId, record);
    const status = buildStatusPayload(normalized.record, now, reward.cooldownMs);

    if (!status.available) {
      res.status(429).json({ ok: false, message: "Cooldown active.", remainingMs: status.remainingMs });
      return;
    }

    const visit = await prisma.faucetPartnerVisit.findUnique({
      where: { userId_dayKey: { userId, dayKey: normalized.todayKey } }
    });

    const lastClaimAt = normalized.record?.claimedAt?.getTime() || 0;
    const visitOpenedAt = visit?.openedAt?.getTime() || 0;
    const visitEligibleAt = visit?.eligibleAt?.getTime() || 0;
    const hasFreshVisit = visitOpenedAt > 0 && visitOpenedAt > lastClaimAt;
    const waitRemainingMs = hasFreshVisit ? Math.max(0, visitEligibleAt - now.getTime()) : 0;
    const partnerReady = hasFreshVisit && waitRemainingMs === 0;

    if (!partnerReady) {
      res.status(403).json({
        ok: false,
        message: "Visita ao parceiro incompleta ou tempo mínimo não atingido."
      });
      return;
    }

    const miner = reward.miner;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await createInventoryWithOwnedMachineTx(tx, {
        userId,
        minerId: miner.id,
        minerName: miner.name,
        level: 1,
        hashRate: miner.baseHashRate,
        slotSize: miner.slotSize,
        imageUrl: miner.imageUrl || DEFAULT_MINER_IMAGE_URL,
        acquiredAt: now,
        updatedAt: now
      });

      await tx.faucetClaim.upsert({
        where: { userId },
        update: { claimedAt: now, totalClaims: { increment: 1 }, dayKey: normalized.todayKey },
        create: { userId, claimedAt: now, totalClaims: 1, dayKey: normalized.todayKey }
      });
    });

    faucetLogger.info("Faucet inventory reward created (permanent, no expiresAt)", {
      userId,
      minerId: miner.id,
      minerName: miner.name,
      inventoryExpiresAt: null
    });
    logSecurityEvent(
      "faucet_inventory_reward_created",
      { userId, minerId: miner.id, inventoryPermanent: true, inventoryExpiresAt: null },
      req
    );
    logUserActivity("FAUCET_CLAIM_SUCCESS", req, {
      userId,
      minerId: miner.id,
      minerName: miner.name,
      hashRate: Number(miner.baseHashRate || 0),
      slotSize: Number(miner.slotSize || 1),
      dayKey: normalized.todayKey
    });

    res.json({
      ok: true,
      message: `Claim successful! ${miner.name} added.`,
      nextAvailableAt: now.getTime() + reward.cooldownMs
    });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Error claiming faucet." });
  }
}
