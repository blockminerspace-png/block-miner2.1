import { Prisma } from "@prisma/client";
import {
  REWARD_BLK,
  REWARD_HASHRATE_TEMP,
  REWARD_POL
} from "./internalOfferwallConstants.js";

const OFFERWALL_GAME_SLUG = "internal_offerwall_power";

async function getOrCreateOfferwallGameId(tx) {
  const g = await tx.game.upsert({
    where: { slug: OFFERWALL_GAME_SLUG },
    create: { name: "Offerwall Temporary Power", slug: OFFERWALL_GAME_SLUG, isActive: true },
    update: {},
  });
  return g.id;
}

/**
 * Grants the offerwall reward directly (no inbox intermediary).
 * Returns polDelta > 0 if POL was credited so the caller can sync the engine.
 *
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {{ userId: number, rewardKind: string, rewardBlkAmount: import("@prisma/client").Prisma.Decimal | null, rewardPolAmount: import("@prisma/client").Prisma.Decimal | null, rewardHashRate: number | null, rewardHashRateDays: number | null }} args
 */
export async function grantInternalOfferwallRewardInTx(tx, args): Promise<{ kind: string; polDelta: number }> {
  const { userId, rewardKind } = args;
  const kind = String(rewardKind || "").toUpperCase();

  if (kind === REWARD_BLK) {
    const amt = args.rewardBlkAmount;
    if (!amt || new Prisma.Decimal(amt.toString()).lte(0)) {
      throw new Error("REWARD_BLK_INVALID");
    }
    await tx.user.update({
      where: { id: userId },
      data: { blkBalance: { increment: new Prisma.Decimal(amt.toString()) } },
    });
    return { kind: REWARD_BLK, polDelta: 0 };
  }

  if (kind === REWARD_POL) {
    const amt = args.rewardPolAmount;
    if (!amt || new Prisma.Decimal(amt.toString()).lte(0)) {
      throw new Error("REWARD_POL_INVALID");
    }
    const polDecimal = new Prisma.Decimal(amt.toString());
    await tx.user.update({
      where: { id: userId },
      data: { polBalance: { increment: polDecimal } },
    });
    return { kind: REWARD_POL, polDelta: Number(polDecimal) };
  }

  if (kind === REWARD_HASHRATE_TEMP) {
    const hr = Number(args.rewardHashRate || 0);
    const days = Math.max(1, Math.min(365, Math.floor(Number(args.rewardHashRateDays || 1))));
    if (!(hr > 0)) throw new Error("REWARD_HASHRATE_INVALID");
    const gameId = await getOrCreateOfferwallGameId(tx);
    const playedAt = new Date();
    const expiresAt = new Date(playedAt.getTime() + days * 24 * 60 * 60 * 1000);
    await tx.userPowerGame.create({
      data: { userId, gameId, hashRate: hr, playedAt, expiresAt },
    });
    return { kind: REWARD_HASHRATE_TEMP, polDelta: 0 };
  }

  throw new Error("REWARD_KIND_UNSUPPORTED");
}
