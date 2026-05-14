import { Prisma } from "@prisma/client";
import {
  REWARD_BLK,
  REWARD_HASHRATE_TEMP,
  REWARD_POL
} from "./internalOfferwallConstants.js";

const GAME_SLUG = "internal-offerwall";

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @returns {Promise<number>}
 */
async function getOrCreateOfferwallGameId(tx) {
  const existing = await tx.game.findUnique({ where: { slug: GAME_SLUG } });
  if (existing) return existing.id;
  const g = await tx.game.create({
    data: { name: "Internal Offerwall", slug: GAME_SLUG, isActive: true }
  });
  return g.id;
}

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {{ userId: number, rewardKind: string, rewardBlkAmount: import("@prisma/client").Prisma.Decimal | null, rewardPolAmount: import("@prisma/client").Prisma.Decimal | null, rewardHashRate: number | null, rewardHashRateDays: number | null }} args
 */
export async function grantInternalOfferwallRewardInTx(tx, args) {
  const { userId, rewardKind } = args;
  const kind = String(rewardKind || "").toUpperCase();

  if (kind === REWARD_BLK) {
    const amt = args.rewardBlkAmount;
    if (!amt || new Prisma.Decimal(amt.toString()).lte(0)) {
      throw new Error("REWARD_BLK_INVALID");
    }
    await tx.user.update({
      where: { id: userId },
      data: { blkBalance: { increment: amt } }
    });
    return { kind: REWARD_BLK, amount: amt.toString() };
  }

  if (kind === REWARD_POL) {
    const amt = args.rewardPolAmount;
    if (!amt || new Prisma.Decimal(amt.toString()).lte(0)) {
      throw new Error("REWARD_POL_INVALID");
    }
    await tx.user.update({
      where: { id: userId },
      data: { polBalance: { increment: amt } }
    });
    return { kind: REWARD_POL, amount: amt.toString() };
  }

  if (kind === REWARD_HASHRATE_TEMP) {
    const hr = Number(args.rewardHashRate || 0);
    const days = Math.max(1, Math.min(365, Math.floor(Number(args.rewardHashRateDays || 1))));
    if (!(hr > 0)) throw new Error("REWARD_HASHRATE_INVALID");
    const gameId = await getOrCreateOfferwallGameId(tx);
    const playedAt = new Date();
    const expiresAt = new Date(playedAt.getTime() + days * 86400000);
    await tx.userPowerGame.create({
      data: {
        userId,
        gameId,
        hashRate: hr,
        playedAt,
        expiresAt
      }
    });
    return { kind: REWARD_HASHRATE_TEMP, hashRate: hr, days };
  }

  throw new Error("REWARD_KIND_UNSUPPORTED");
}
