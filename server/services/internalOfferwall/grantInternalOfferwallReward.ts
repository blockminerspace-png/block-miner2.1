import { Prisma } from "@prisma/client";
import {
  REWARD_BLK,
  REWARD_HASHRATE_TEMP,
  REWARD_POL
} from "./internalOfferwallConstants.js";
import {
  createRewardInboxEntry,
  INBOX_SOURCE_OFFERWALL,
} from "../rewardInboxService.js";

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
    await createRewardInboxEntry(tx, {
      userId,
      source: INBOX_SOURCE_OFFERWALL,
      rewardType: "blk",
      rewardValue: amt.toString(),
    });
    return { kind: REWARD_BLK, amount: amt.toString() };
  }

  if (kind === REWARD_POL) {
    const amt = args.rewardPolAmount;
    if (!amt || new Prisma.Decimal(amt.toString()).lte(0)) {
      throw new Error("REWARD_POL_INVALID");
    }
    await createRewardInboxEntry(tx, {
      userId,
      source: INBOX_SOURCE_OFFERWALL,
      rewardType: "pol",
      rewardValue: amt.toString(),
    });
    return { kind: REWARD_POL, amount: amt.toString() };
  }

  if (kind === REWARD_HASHRATE_TEMP) {
    const hr = Number(args.rewardHashRate || 0);
    const days = Math.max(1, Math.min(365, Math.floor(Number(args.rewardHashRateDays || 1))));
    if (!(hr > 0)) throw new Error("REWARD_HASHRATE_INVALID");
    await createRewardInboxEntry(tx, {
      userId,
      source: INBOX_SOURCE_OFFERWALL,
      rewardType: "temporary_power",
      rewardValue: hr,
      durationHours: days * 24,
    });
    return { kind: REWARD_HASHRATE_TEMP, hashRate: hr, days };
  }

  throw new Error("REWARD_KIND_UNSUPPORTED");
}
