import { Prisma, type PrismaClient } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import { computeCheckinStreak } from "../../utils/checkinStreak.js";
import { syncUserBaseHashRate } from "../../models/minerProfileModel.js";
import { getMiningEngine } from "../../src/miningEngineInstance.js";
import { createInventoryWithOwnedMachineTx } from "../../services/userOwnedMachineService.js";
import { normalizePersistableMinerImageUrl } from "../../utils/ownedMachineImage.js";

export const REWARD_POL = "pol";
export const REWARD_BALANCE = "balance";
export const REWARD_STELAR = "stelar";
export const REWARD_ZER = "zer";
export const REWARD_HASHRATE = "hashrate";
export const REWARD_MACHINE = "machine";
export const REWARD_ITEM = "item";
export const REWARD_TICKET = "ticket";
export const REWARD_NONE = "none";

const CHECKIN_BONUS_GAME_SLUG = "checkin-streak-bonus";

type MilestoneRow = {
  id: number;
  dayThreshold: number;
  rewardType: string;
  rewardValue: Prisma.Decimal;
  validityDays: number;
  displayTitle: string | null;
  description: string | null;
  minerId: number | null;
  itemCode: string | null;
  metadataJson: Prisma.JsonValue | null;
};

async function getOrCreateCheckinBonusGameId(
  tx: PrismaClient | Prisma.TransactionClient = prisma,
) {
  const g = await tx.game.upsert({
    where: { slug: CHECKIN_BONUS_GAME_SLUG },
    create: {
      name: "Check-in streak bonus",
      slug: CHECKIN_BONUS_GAME_SLUG,
      isActive: true,
    },
    update: {},
  });
  return g.id;
}

function normalizeRewardType(raw: string): string {
  const t = String(raw || REWARD_NONE).toLowerCase();
  if (t === REWARD_BALANCE) return REWARD_POL;
  if (t === REWARD_ZER) return REWARD_STELAR;
  return t;
}

async function grantMachineMilestone(
  tx: Prisma.TransactionClient,
  userId: number,
  milestone: MilestoneRow,
): Promise<void> {
  const minerId = milestone.minerId;
  if (!minerId || minerId < 1) {
    throw new Error("MACHINE_REWARD_MISSING_MINER");
  }
  const miner = await tx.miner.findFirst({
    where: { id: minerId, isActive: true, isArchived: false },
  });
  if (!miner) {
    throw new Error("MACHINE_REWARD_MINER_NOT_FOUND");
  }
  const imageUrl = normalizePersistableMinerImageUrl(miner.imageUrl);
  await createInventoryWithOwnedMachineTx(tx, {
    userId,
    minerId: miner.id,
    minerName: miner.name,
    level: 1,
    hashRate: miner.baseHashRate,
    slotSize: miner.slotSize ?? 1,
    imageUrl,
    snapshotSlug: miner.slug,
    snapshotPrice: miner.price,
    acquisitionSource: "checkin_milestone",
  });
}

async function grantItemMilestone(
  tx: Prisma.TransactionClient,
  userId: number,
  milestone: MilestoneRow,
): Promise<void> {
  const code = String(milestone.itemCode ?? "").trim();
  if (!code) throw new Error("ITEM_REWARD_MISSING_CODE");
  const meta =
    milestone.metadataJson && typeof milestone.metadataJson === "object"
      ? (milestone.metadataJson as Record<string, unknown>)
      : {};
  const qty = Number(meta.quantity ?? milestone.rewardValue ?? 1);
  const amount = Number.isFinite(qty) && qty > 0 ? qty : 1;
  const hashRate = Number(meta.hashRate ?? 0);
  const minerName = String(meta.minerName ?? code);
  await createInventoryWithOwnedMachineTx(tx, {
    userId,
    minerId: typeof meta.minerId === "number" ? meta.minerId : null,
    minerName,
    level: 1,
    hashRate: Number.isFinite(hashRate) ? hashRate : 0,
    slotSize: Number(meta.slotSize ?? 1),
    imageUrl: typeof meta.imageUrl === "string" ? meta.imageUrl : null,
    acquisitionSource: `checkin_item:${code}`,
  });
}

async function applyMilestoneRewardInTx(
  tx: Prisma.TransactionClient,
  userId: number,
  milestone: MilestoneRow,
): Promise<boolean> {
  const rewardType = normalizeRewardType(milestone.rewardType);
  const value = Number(milestone.rewardValue || 0);

  if (rewardType === REWARD_POL && value > 0) {
    await tx.user.update({
      where: { id: userId },
      data: { polBalance: { increment: new Prisma.Decimal(String(value)) } },
    });
    return false;
  }

  if ((rewardType === REWARD_STELAR || rewardType === REWARD_ZER) && value > 0) {
    await tx.user.update({
      where: { id: userId },
      data: { zerBalance: { increment: new Prisma.Decimal(String(value)) } },
    });
    return false;
  }

  if (rewardType === REWARD_HASHRATE && value > 0) {
    const gameId = await getOrCreateCheckinBonusGameId(tx);
    const days = Math.max(1, Number(milestone.validityDays || 7));
    const playedAt = new Date();
    const expiresAt = new Date(playedAt.getTime() + days * 24 * 60 * 60 * 1000);
    await tx.userPowerGame.create({
      data: {
        userId,
        gameId,
        hashRate: value,
        playedAt,
        expiresAt,
      },
    });
    return true;
  }

  if (rewardType === REWARD_MACHINE) {
    await grantMachineMilestone(tx, userId, milestone);
    return true;
  }

  if (rewardType === REWARD_ITEM) {
    await grantItemMilestone(tx, userId, milestone);
    return true;
  }

  return false;
}

export async function applyStreakMilestoneRewards(userId: number) {
  const streak = await computeCheckinStreak(userId);
  const milestones = await prisma.checkinStreakMilestone.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { dayThreshold: "asc" }],
  });
  if (milestones.length === 0) {
    return { granted: [], streak };
  }

  const claimedRows = await prisma.userCheckinStreakReward.findMany({
    where: { userId },
    select: { milestoneId: true },
  });
  const claimed = new Set(claimedRows.map((r) => r.milestoneId));

  const granted: Array<{
    milestoneId: number;
    dayThreshold: number;
    rewardType: string;
    rewardValue: number;
  }> = [];
  let needsEngineReload = false;

  for (const m of milestones) {
    if (streak < m.dayThreshold) continue;
    if (claimed.has(m.id)) continue;

    const rewardType = normalizeRewardType(m.rewardType);
    const value = Number(m.rewardValue || 0);

    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.userCheckinStreakReward.create({
          data: {
            userId,
            milestoneId: m.id,
            streakWhenClaimed: streak,
          },
        });
        const reload = await applyMilestoneRewardInTx(tx, userId, m);
        if (reload) needsEngineReload = true;
      });

      granted.push({
        milestoneId: m.id,
        dayThreshold: m.dayThreshold,
        rewardType,
        rewardValue: value,
      });
      claimed.add(m.id);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      const message = error instanceof Error ? error.message : "unknown";
      console.error("checkin.rewards apply", { userId, milestoneId: m.id, err: message });
    }
  }

  if (needsEngineReload) {
    await syncUserBaseHashRate(userId);
    getMiningEngine()?.reloadMinerProfile(userId).catch(() => {});
  }

  return { granted, streak };
}

export async function buildMilestoneStatusForUser(userId: number, streak: number) {
  const milestones = await prisma.checkinStreakMilestone.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { dayThreshold: "asc" }],
  });
  const claims = await prisma.userCheckinStreakReward.findMany({
    where: { userId },
    select: { milestoneId: true, streakWhenClaimed: true, createdAt: true },
  });
  const claimByMilestone = new Map(claims.map((c) => [c.milestoneId, c]));

  return milestones.map((m) => {
    const claim = claimByMilestone.get(m.id);
    const claimed = Boolean(claim);
    const reached = streak >= m.dayThreshold;
    let state = "locked";
    if (claimed) state = "claimed";
    else if (reached) state = "eligible";

    const rewardType = normalizeRewardType(m.rewardType);
    return {
      id: m.id,
      milestoneDay: m.dayThreshold,
      dayThreshold: m.dayThreshold,
      rewardType,
      rewardValue: Number(m.rewardValue || 0),
      amount: Number(m.rewardValue || 0),
      validityDays: m.validityDays,
      minerId: m.minerId,
      itemCode: m.itemCode,
      status: state,
      state,
      labelKey: `checkin.milestones.reward.${rewardType}.title`,
      sortOrder: m.sortOrder,
      claimedAt: claim?.createdAt?.toISOString() ?? null,
    };
  });
}

export function buildUpcomingMilestones(
  milestones: Awaited<ReturnType<typeof buildMilestoneStatusForUser>>,
) {
  return milestones
    .filter((m) => m.state !== "claimed")
    .slice(0, 8)
    .map((m) => ({
      day: m.dayThreshold,
      milestoneDay: m.dayThreshold,
      rewardType: m.rewardType,
      rewardValue: m.rewardValue,
      amount: m.rewardValue,
      itemCode: m.itemCode ?? null,
      minerId: m.minerId ?? null,
      labelKey: `checkin.milestones.reward.${m.rewardType}.title`,
    }));
}
