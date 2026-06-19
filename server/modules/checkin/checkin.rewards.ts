import { Prisma } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import { computeCheckinStreak } from "../../utils/checkinStreak.js";
import { normalizePersistableMinerImageUrl } from "../../utils/ownedMachineImage.js";
import {
  isAllowedMilestoneRewardType,
  isInvalidLegacyMilestoneRewardType,
  LEGACY_REWARD_HASHRATE,
  normalizeMilestoneRewardType,
  readDurationHours,
  REWARD_MACHINE,
  REWARD_POL,
  REWARD_TEMPORARY_POWER,
} from "./checkin.milestoneRules.js";
import {
  createRewardInboxEntry,
  INBOX_SOURCE_CHECKIN,
} from "../../services/rewardInboxService.js";

export {
  REWARD_POL,
  REWARD_TEMPORARY_POWER,
  REWARD_MACHINE,
  LEGACY_REWARD_HASHRATE,
} from "./checkin.milestoneRules.js";

/** @deprecated Use REWARD_TEMPORARY_POWER */
export const REWARD_HASHRATE = LEGACY_REWARD_HASHRATE;
export const REWARD_BALANCE = "balance";
export const REWARD_STELAR = "stelar";
export const REWARD_ZER = "zer";
export const REWARD_ITEM = "item";
export const REWARD_TICKET = "ticket";
export const REWARD_NONE = "none";

type MilestoneRow = {
  id: number;
  dayThreshold: number;
  rewardType: string;
  rewardValue: Prisma.Decimal;
  validityDays: number;
  minerId: number | null;
  itemCode: string | null;
  metadataJson: Prisma.JsonValue | null;
};

export function normalizeRewardType(raw: string): string {
  return normalizeMilestoneRewardType(raw);
}

async function applyMilestoneRewardInTx(
  tx: Prisma.TransactionClient,
  userId: number,
  milestone: MilestoneRow,
): Promise<boolean> {
  const rewardType = normalizeMilestoneRewardType(milestone.rewardType);
  if (!isAllowedMilestoneRewardType(rewardType)) {
    throw new Error(`MILESTONE_REWARD_TYPE_NOT_ALLOWED:${milestone.rewardType}`);
  }

  const value = Number(milestone.rewardValue || 0);

  if (rewardType === REWARD_POL) {
    if (!(value > 0)) throw new Error("POL_REWARD_INVALID_AMOUNT");
    await createRewardInboxEntry(tx, {
      userId,
      source: INBOX_SOURCE_CHECKIN,
      rewardType: "pol",
      rewardValue: value,
    });
    return false;
  }

  if (rewardType === REWARD_TEMPORARY_POWER) {
    if (!(value > 0)) throw new Error("TEMPORARY_POWER_REWARD_INVALID_AMOUNT");
    const durationHours = readDurationHours(milestone.validityDays, milestone.metadataJson);
    await createRewardInboxEntry(tx, {
      userId,
      source: INBOX_SOURCE_CHECKIN,
      rewardType: "temporary_power",
      rewardValue: value,
      durationHours,
    });
    return false;
  }

  if (rewardType === REWARD_MACHINE) {
    const minerId = milestone.minerId;
    if (!minerId || minerId < 1) throw new Error("MACHINE_REWARD_MISSING_MINER");
    const miner = await tx.miner.findFirst({
      where: { id: minerId, isActive: true, isArchived: false },
      select: {
        id: true,
        name: true,
        baseHashRate: true,
        imageUrl: true,
        slug: true,
        price: true,
        slotSize: true,
      },
    });
    if (!miner) throw new Error("MACHINE_REWARD_MINER_NOT_FOUND");
    const imageUrl = normalizePersistableMinerImageUrl(miner.imageUrl);
    await createRewardInboxEntry(tx, {
      userId,
      source: INBOX_SOURCE_CHECKIN,
      rewardType: "machine",
      rewardValue: Number(miner.baseHashRate ?? 0),
      minerId: miner.id,
      minerName: miner.name,
      minerImageUrl: imageUrl,
      slotSize: miner.slotSize ?? 1,
    });
    return false;
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

  for (const m of milestones) {
    if (isInvalidLegacyMilestoneRewardType(m.rewardType)) {
      continue;
    }
    if (!isAllowedMilestoneRewardType(m.rewardType)) {
      continue;
    }
    if (streak < m.dayThreshold) continue;
    if (claimed.has(m.id)) continue;

    const rewardType = normalizeMilestoneRewardType(m.rewardType);
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
        await applyMilestoneRewardInTx(tx, userId, m);
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

  return { granted, streak };
}

export async function buildMilestoneStatusForUser(userId: number, streak: number) {
  const milestones = await prisma.checkinStreakMilestone.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { dayThreshold: "asc" }],
    include: {
      miner: { select: { id: true, name: true, baseHashRate: true, imageUrl: true } },
    },
  });
  const claims = await prisma.userCheckinStreakReward.findMany({
    where: { userId },
    select: { milestoneId: true, streakWhenClaimed: true, createdAt: true },
  });
  const claimByMilestone = new Map(claims.map((c) => [c.milestoneId, c]));

  const out: Array<Record<string, unknown>> = [];

  for (const m of milestones) {
    const legacyInvalid = isInvalidLegacyMilestoneRewardType(m.rewardType);
    const rewardType = normalizeMilestoneRewardType(m.rewardType);
    const allowed = isAllowedMilestoneRewardType(rewardType);

    if (legacyInvalid || !allowed) {
      out.push({
        id: m.id,
        milestoneDay: m.dayThreshold,
        dayThreshold: m.dayThreshold,
        rewardType: "unavailable",
        rewardValue: 0,
        amount: 0,
        validityDays: m.validityDays,
        durationHours: null,
        minerId: null,
        minerName: null,
        itemCode: null,
        status: "unavailable",
        state: "unavailable",
        legacyInvalid: true,
        labelKey: "checkin.milestones.reward.unavailable.title",
        sortOrder: m.sortOrder,
        claimedAt: null,
      });
      continue;
    }

    const claim = claimByMilestone.get(m.id);
    const claimed = Boolean(claim);
    const reached = streak >= m.dayThreshold;
    let state = "locked";
    if (claimed) state = "claimed";
    else if (reached) state = "eligible";

    const durationHours = readDurationHours(m.validityDays, m.metadataJson);

    out.push({
      id: m.id,
      milestoneDay: m.dayThreshold,
      dayThreshold: m.dayThreshold,
      rewardType,
      rewardValue: Number(m.rewardValue || 0),
      amount: Number(m.rewardValue || 0),
      powerAmount: rewardType === REWARD_TEMPORARY_POWER ? Number(m.rewardValue || 0) : null,
      durationHours: rewardType === REWARD_TEMPORARY_POWER ? durationHours : null,
      validityDays: m.validityDays,
      minerId: m.minerId,
      minerName: m.miner?.name ?? null,
      minerImageUrl: m.miner?.imageUrl ?? null,
      itemCode: null,
      status: state,
      state,
      legacyInvalid: false,
      labelKey: `checkin.milestones.reward.${rewardType}.title`,
      sortOrder: m.sortOrder,
      claimedAt: claim?.createdAt?.toISOString() ?? null,
    });
  }

  return out;
}

export function buildUpcomingMilestones(
  milestones: Awaited<ReturnType<typeof buildMilestoneStatusForUser>>,
) {
  return milestones
    .filter((m) => m.state !== "claimed" && m.state !== "unavailable" && m.rewardType !== "unavailable")
    .slice(0, 8)
    .map((m) => ({
      day: m.dayThreshold as number,
      milestoneDay: m.dayThreshold as number,
      rewardType: String(m.rewardType),
      rewardValue: m.rewardValue as number,
      amount: m.amount as number,
      durationHours: m.durationHours ?? null,
      minerId: (m.minerId as number | null) ?? null,
      minerName: (m.minerName as string | null) ?? null,
      labelKey: String(m.labelKey),
    }));
}
