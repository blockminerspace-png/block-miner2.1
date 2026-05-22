import { Prisma } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import { syncUserBaseHashRate } from "../../models/minerProfileModel.js";
import { getMiningEngine } from "../../src/miningEngineInstance.js";
import { createInventoryWithOwnedMachineTx } from "../../services/userOwnedMachineService.js";
import { applyPolDeltaInEngine } from "../../services/miniPass/miniPassRewardFulfillmentService.js";

const CHECKIN_BONUS_GAME_SLUG = "checkin-streak-bonus";

async function getOrCreateBonusGameId(tx: Prisma.TransactionClient) {
  const g = await tx.game.upsert({
    where: { slug: CHECKIN_BONUS_GAME_SLUG },
    create: { name: "Check-in streak bonus", slug: CHECKIN_BONUS_GAME_SLUG, isActive: true },
    update: {},
  });
  return g.id;
}

export async function listPendingInboxForUser(userId: number) {
  return prisma.userRewardInbox.findMany({
    where: { userId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });
}

export async function collectInboxItem(userId: number, inboxId: number) {
  const item = await prisma.userRewardInbox.findFirst({
    where: { id: inboxId, userId, status: "pending" },
  });
  if (!item) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });

  let needsEngineReload = false;
  let polDelta = 0;

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const locked = await tx.userRewardInbox.updateMany({
      where: { id: inboxId, userId, status: "pending" },
      data: { status: "collected", collectedAt: new Date() },
    });
    if (locked.count !== 1) throw Object.assign(new Error("ALREADY_COLLECTED"), { code: "ALREADY_COLLECTED" });

    const value = Number(item.rewardValue || 0);
    const rt = item.rewardType;

    if (rt === "pol") {
      if (!(value > 0)) throw new Error("INVALID_REWARD_VALUE");
      await tx.user.update({
        where: { id: userId },
        data: { polBalance: { increment: new Prisma.Decimal(String(value)) } },
      });
      polDelta = value;
    } else if (rt === "blk") {
      if (!(value > 0)) throw new Error("INVALID_REWARD_VALUE");
      await tx.user.update({
        where: { id: userId },
        data: { blkBalance: { increment: new Prisma.Decimal(String(value)) } },
      });
    } else if (rt === "temporary_power") {
      if (!(value > 0)) throw new Error("INVALID_REWARD_VALUE");
      const gameId = await getOrCreateBonusGameId(tx);
      const durationMs = (item.durationHours ?? 24) * 60 * 60 * 1000;
      const playedAt = new Date();
      await tx.userPowerGame.create({
        data: {
          userId,
          gameId,
          hashRate: value,
          playedAt,
          expiresAt: new Date(playedAt.getTime() + durationMs),
        },
      });
      needsEngineReload = true;
    } else if (rt === "machine") {
      if (!item.minerName) throw new Error("MISSING_MINER_NAME");
      await createInventoryWithOwnedMachineTx(tx, {
        userId,
        minerId: item.minerId ?? null,
        minerName: item.minerName,
        level: 1,
        hashRate: value,
        slotSize: item.slotSize ?? 1,
        imageUrl: item.minerImageUrl ?? null,
        acquisitionSource: item.source,
      });
      needsEngineReload = true;
    }
  });

  if (polDelta > 0) applyPolDeltaInEngine(userId, polDelta);
  if (needsEngineReload) {
    await syncUserBaseHashRate(userId);
    getMiningEngine()?.reloadMinerProfile(userId).catch(() => {});
  }

  return { ok: true };
}

export async function collectAllPendingForUser(userId: number) {
  const items = await prisma.userRewardInbox.findMany({
    where: { userId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });
  const results = await Promise.allSettled(
    items.map((item) => collectInboxItem(userId, item.id)),
  );
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  return { ok: true, collected: succeeded, failed };
}
