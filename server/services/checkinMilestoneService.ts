import { Prisma, type PrismaClient } from "@prisma/client";
import prisma from "../src/db/prisma.js";
import { computeCheckinStreak } from "../utils/checkinStreak.js";
import { syncUserBaseHashRate } from "../models/minerProfileModel.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";

export const REWARD_POL = "pol";
export const REWARD_HASHRATE = "hashrate";
export const REWARD_NONE = "none";

const CHECKIN_BONUS_GAME_SLUG = "checkin-streak-bonus";

async function getOrCreateCheckinBonusGameId(
  tx: PrismaClient | Prisma.TransactionClient = prisma
) {
  const g = await tx.game.upsert({
    where: { slug: CHECKIN_BONUS_GAME_SLUG },
    create: {
      name: "Check-in streak bonus",
      slug: CHECKIN_BONUS_GAME_SLUG,
      isActive: true
    },
    update: {}
  });
  return g.id;
}

/**
 * After a check-in is confirmed: grant POL / temporary hashrate for each active milestone
 * the user has reached and not yet claimed. Idempotent per (user, milestone).
 */
export async function applyStreakMilestoneRewards(userId) {
  const streak = await computeCheckinStreak(userId);
  const milestones = await prisma.checkinStreakMilestone.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { dayThreshold: "asc" }]
  });
  if (milestones.length === 0) {
    return { granted: [], streak };
  }

  const claimedRows = await prisma.userCheckinStreakReward.findMany({
    where: { userId },
    select: { milestoneId: true }
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

    const rewardType = (m.rewardType || REWARD_NONE).toLowerCase();
    const value = Number(m.rewardValue || 0);

    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.userCheckinStreakReward.create({
          data: {
            userId,
            milestoneId: m.id,
            streakWhenClaimed: streak
          }
        });

        if (rewardType === REWARD_POL && value > 0) {
          await tx.user.update({
            where: { id: userId },
            data: { polBalance: { increment: new Prisma.Decimal(String(value)) } }
          });
        }

        if (rewardType === REWARD_HASHRATE && value > 0) {
          const gameId = await getOrCreateCheckinBonusGameId(tx);
          const days = Math.max(1, Number(m.validityDays || 7));
          const playedAt = new Date();
          const expiresAt = new Date(playedAt.getTime() + days * 24 * 60 * 60 * 1000);
          await tx.userPowerGame.create({
            data: {
              userId,
              gameId,
              hashRate: value,
              playedAt,
              expiresAt
            }
          });
          needsEngineReload = true;
        }
      });

      granted.push({
        milestoneId: m.id,
        dayThreshold: m.dayThreshold,
        rewardType,
        rewardValue: value
      });
      claimed.add(m.id);
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      const message = error instanceof Error ? error.message : "unknown";
      console.error("checkinMilestoneService apply", { userId, milestoneId: m.id, err: message });
    }
  }

  if (needsEngineReload) {
    await syncUserBaseHashRate(userId);
    getMiningEngine()?.reloadMinerProfile(userId).catch(() => {});
  }

  return { granted, streak };
}

export async function buildMilestoneStatusForUser(userId, streak) {
  const milestones = await prisma.checkinStreakMilestone.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { dayThreshold: "asc" }]
  });
  const claims = await prisma.userCheckinStreakReward.findMany({
    where: { userId },
    select: { milestoneId: true, streakWhenClaimed: true, createdAt: true }
  });
  const claimByMilestone = new Map(claims.map((c) => [c.milestoneId, c]));

  return milestones.map((m) => {
    const claim = claimByMilestone.get(m.id);
    const claimed = Boolean(claim);
    const reached = streak >= m.dayThreshold;
    let state = "locked";
    if (claimed) state = "claimed";
    else if (reached) state = "eligible";

    return {
      id: m.id,
      dayThreshold: m.dayThreshold,
      rewardType: m.rewardType,
      rewardValue: Number(m.rewardValue || 0),
      validityDays: m.validityDays,
      displayTitle: m.displayTitle,
      description: m.description,
      sortOrder: m.sortOrder,
      state,
      claimedAt: claim?.createdAt?.toISOString() ?? null
    };
  });
}
