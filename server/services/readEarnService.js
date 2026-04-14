import bcrypt from "bcryptjs";
import { Prisma } from "../src/db/prismaNamespace.js";
import prisma from "../src/db/prisma.js";
import { syncUserBaseHashRate } from "../models/minerProfileModel.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import {
  READ_EARN_BLK,
  READ_EARN_GAME_SLUG,
  READ_EARN_HASHRATE,
  READ_EARN_MACHINE,
  REDEEM_ALREADY,
  REDEEM_GENERIC
} from "../utils/readEarnConstants.js";
import { createInventoryWithOwnedMachineTx } from "./userOwnedMachineService.js";

class RedeemAbort extends Error {
  /**
   * @param {string} code
   */
  constructor(code) {
    super(code);
    this.name = "RedeemAbort";
    this.redeemCode = code;
  }
}

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 */
async function getOrCreateReadEarnGameId(tx) {
  const g = await tx.game.upsert({
    where: { slug: READ_EARN_GAME_SLUG },
    create: {
      name: "Read & Earn partner",
      slug: READ_EARN_GAME_SLUG,
      isActive: true
    },
    update: {}
  });
  return g.id;
}

/**
 * @param {{ isActive: boolean; startsAt: Date; expiresAt: Date }} c
 * @param {Date} now
 */
export function isReadEarnCampaignLive(c, now) {
  if (!c?.isActive) return false;
  if (now < new Date(c.startsAt)) return false;
  if (now > new Date(c.expiresAt)) return false;
  return true;
}

/**
 * Public listing: active window only (no secret fields).
 * @param {Date} [now]
 */
export async function listPublicReadEarnCampaigns(now = new Date()) {
  return prisma.readEarnCampaign.findMany({
    where: {
      isActive: true,
      startsAt: { lte: now },
      expiresAt: { gte: now }
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      title: true,
      partnerUrl: true,
      startsAt: true,
      expiresAt: true
    }
  });
}

/**
 * Validates campaign + code, grants reward, writes redemption + notification.
 * @param {object} opts
 * @param {number} opts.userId
 * @param {number} opts.campaignId
 * @param {string} opts.rawCode
 * @param {string | null} [opts.ip]
 * @param {string | null} [opts.userAgent]
 * @param {{ error?: (msg: string, meta?: object) => void }} [opts.logger]
 */
export async function redeemReadEarnCampaign({
  userId,
  campaignId,
  rawCode,
  ip = null,
  userAgent = null,
  logger = null
}) {
  const code = String(rawCode || "").trim();
  if (!code || code.length > 128) {
    return { ok: false, code: REDEEM_GENERIC };
  }

  const now = new Date();
  const preview = await prisma.readEarnCampaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      title: true,
      isActive: true,
      startsAt: true,
      expiresAt: true
    }
  });

  if (!preview || !isReadEarnCampaignLive(preview, now)) {
    return { ok: false, code: REDEEM_GENERIC };
  }

  let needsHashReload = false;

  try {
    const snapshot = await prisma.$transaction(async (tx) => {
      const c = await tx.readEarnCampaign.findUnique({
        where: { id: campaignId }
      });

      if (!c || !isReadEarnCampaignLive(c, now)) {
        throw new RedeemAbort(REDEEM_GENERIC);
      }

      const existing = await tx.readEarnRedemption.findUnique({
        where: { userId_campaignId: { userId, campaignId } }
      });
      if (existing) {
        throw new RedeemAbort(REDEEM_ALREADY);
      }

      if (c.maxRedemptions != null) {
        const cnt = await tx.readEarnRedemption.count({ where: { campaignId } });
        if (cnt >= c.maxRedemptions) {
          throw new RedeemAbort(REDEEM_GENERIC);
        }
      }

      const match = await bcrypt.compare(code, c.codeHash);
      if (!match) {
        throw new RedeemAbort(REDEEM_GENERIC);
      }

      const rt = String(c.rewardType || "").toLowerCase();
      const amt = Number(c.rewardAmount || 0);

      const snap = {
        rewardType: rt,
        rewardAmount: amt,
        rewardMinerId: c.rewardMinerId,
        hashrateValidityDays:
          rt === READ_EARN_HASHRATE ? Math.max(1, Number(c.hashrateValidityDays || 7)) : undefined
      };

      if (rt === READ_EARN_BLK && amt > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { blkBalance: { increment: new Prisma.Decimal(String(amt)) } }
        });
      } else if (rt === READ_EARN_HASHRATE && amt > 0) {
        const gameId = await getOrCreateReadEarnGameId(tx);
        const days = Math.max(1, Number(c.hashrateValidityDays || 7));
        const playedAt = new Date();
        const expiresAt = new Date(playedAt.getTime() + days * 86400000);
        await tx.userPowerGame.create({
          data: {
            userId,
            gameId,
            hashRate: amt,
            playedAt,
            expiresAt
          }
        });
        needsHashReload = true;
      } else if (rt === READ_EARN_MACHINE) {
        if (!c.rewardMinerId) {
          throw new RedeemAbort(REDEEM_GENERIC);
        }
        const miner = await tx.miner.findUnique({ where: { id: c.rewardMinerId } });
        if (!miner) {
          throw new RedeemAbort(REDEEM_GENERIC);
        }
        const level = Math.max(1, Math.min(100, Math.floor(amt) || 1));
        const t = new Date();
        await createInventoryWithOwnedMachineTx(tx, {
          userId,
          minerId: miner.id,
          minerName: miner.name,
          level,
          hashRate: miner.baseHashRate,
          slotSize: miner.slotSize,
          imageUrl: miner.imageUrl,
          acquiredAt: t,
          updatedAt: t,
          expiresAt: null,
        });
        needsHashReload = true;
      } else {
        throw new RedeemAbort(REDEEM_GENERIC);
      }

      await tx.readEarnRedemption.create({
        data: {
          campaignId,
          userId,
          rewardSnapshot: snap,
          ip: ip ? String(ip).slice(0, 64) : null,
          userAgent: userAgent ? String(userAgent).slice(0, 512) : null
        }
      });

      await tx.notification.create({
        data: {
          userId,
          title: "Partner reward unlocked",
          message: `Read & Earn: ${c.title}`,
          type: "reward"
        }
      });

      return snap;
    });

    logger?.info?.("readEarn redeem success", { userId, campaignId });
    if (needsHashReload) {
      await syncUserBaseHashRate(userId);
      getMiningEngine()?.reloadMinerProfile(userId).catch(() => {});
    }

    return { ok: true, code: "OK", reward: snapshot };
  } catch (e) {
    if (e instanceof RedeemAbort) {
      return { ok: false, code: e.redeemCode };
    }
    if (e?.code === "P2002") {
      return { ok: false, code: REDEEM_ALREADY };
    }
    logger?.error?.("readEarn redeem failed", { err: e?.message, userId, campaignId });
    return { ok: false, code: REDEEM_GENERIC };
  }
}

/**
 * @param {string} plainCode
 * @returns {Promise<string>}
 */
export async function hashReadEarnCode(plainCode) {
  return bcrypt.hash(String(plainCode).trim(), 10);
}
