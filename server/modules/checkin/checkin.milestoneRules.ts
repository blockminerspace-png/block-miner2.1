import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

export const REWARD_POL = "pol";
export const REWARD_TEMPORARY_POWER = "temporary_power";
export const REWARD_MACHINE = "machine";

/** Legacy DB value — normalized to {@link REWARD_TEMPORARY_POWER}. */
export const LEGACY_REWARD_HASHRATE = "hashrate";

export const ALLOWED_MILESTONE_REWARD_TYPES = new Set<string>([
  REWARD_POL,
  REWARD_TEMPORARY_POWER,
  REWARD_MACHINE,
]);

const DISALLOWED_RAW_REWARD_TYPES = new Set<string>([
  "item",
  "stelar",
  "zer",
  "none",
  "ticket",
]);

export type MilestoneMetadata = {
  durationHours?: number;
};

export type ParsedMilestoneInput = {
  dayThreshold: number;
  rewardType: string;
  rewardValue: Prisma.Decimal;
  validityDays: number;
  displayTitle: null;
  description: null;
  active: boolean;
  sortOrder: number;
  minerId: number | null;
  itemCode: null;
  metadataJson: Prisma.InputJsonValue | typeof Prisma.DbNull;
};

export function normalizeMilestoneRewardType(raw: string): string {
  const t = String(raw || "").trim().toLowerCase();
  if (t === "balance") return REWARD_POL;
  if (t === LEGACY_REWARD_HASHRATE) return REWARD_TEMPORARY_POWER;
  if (t === "zer") return "stelar";
  return t;
}

export function isAllowedMilestoneRewardType(raw: string): boolean {
  return ALLOWED_MILESTONE_REWARD_TYPES.has(normalizeMilestoneRewardType(raw));
}

export function isInvalidLegacyMilestoneRewardType(raw: string): boolean {
  const t = String(raw || "").trim().toLowerCase();
  if (DISALLOWED_RAW_REWARD_TYPES.has(t)) return true;
  if (t === LEGACY_REWARD_HASHRATE || t === "balance") return false;
  return !isAllowedMilestoneRewardType(t);
}

export function readDurationHours(
  validityDays: number,
  metadataJson: Prisma.JsonValue | null | undefined,
): number {
  const meta =
    metadataJson && typeof metadataJson === "object" && !Array.isArray(metadataJson)
      ? (metadataJson as MilestoneMetadata)
      : {};
  const hours = Number(meta.durationHours);
  if (Number.isFinite(hours) && hours > 0) return Math.min(24 * 365, Math.floor(hours));
  const days = Math.max(1, Number(validityDays) || 1);
  return days * 24;
}

function parseMetadata(durationHours: number | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (durationHours == null || !Number.isFinite(durationHours) || durationHours <= 0) {
    return Prisma.DbNull;
  }
  return { durationHours: Math.floor(durationHours) };
}

type MilestoneBody = {
  dayThreshold?: unknown;
  rewardType?: unknown;
  rewardValue?: unknown;
  validityDays?: unknown;
  durationHours?: unknown;
  active?: unknown;
  sortOrder?: unknown;
  minerId?: unknown;
  itemCode?: unknown;
  displayTitle?: unknown;
  description?: unknown;
  metadataJson?: unknown;
};

export function parseMilestoneBody(body: unknown): ParsedMilestoneInput {
  const b = typeof body === "object" && body !== null ? (body as MilestoneBody) : {};
  const dayThreshold = Number(b.dayThreshold);
  if (!Number.isInteger(dayThreshold) || dayThreshold < 1) {
    throw new Error("dayThreshold must be a positive integer.");
  }

  const rewardType = normalizeMilestoneRewardType(String(b.rewardType ?? ""));
  if (!ALLOWED_MILESTONE_REWARD_TYPES.has(rewardType)) {
    throw new Error("rewardType must be pol, temporary_power, or machine.");
  }

  const rewardValue = Number(b.rewardValue ?? 0);
  if (!(rewardValue >= 0) || !Number.isFinite(rewardValue)) {
    throw new Error("rewardValue must be a non-negative number.");
  }

  const minerIdRaw = b.minerId;
  const minerId =
    minerIdRaw === undefined || minerIdRaw === null || minerIdRaw === ""
      ? null
      : Number(minerIdRaw);
  if (minerId != null && (!Number.isInteger(minerId) || minerId < 1)) {
    throw new Error("minerId must be a positive integer when provided.");
  }

  if (b.itemCode != null && String(b.itemCode).trim() !== "") {
    throw new Error("itemCode is not allowed for check-in milestones.");
  }

  let durationHours: number | null = null;
  let validityDays = 1;

  if (rewardType === REWARD_POL) {
    if (!(rewardValue > 0)) throw new Error("POL milestone requires rewardValue > 0.");
    if (minerId != null) throw new Error("POL milestone cannot include minerId.");
  } else if (rewardType === REWARD_TEMPORARY_POWER) {
    durationHours = Number(b.durationHours ?? 0);
    if (!Number.isFinite(durationHours) || durationHours <= 0) {
      const fallbackDays = Math.max(1, Number(b.validityDays ?? 0));
      durationHours = fallbackDays > 0 ? fallbackDays * 24 : 0;
    }
    if (!(durationHours > 0)) {
      throw new Error("temporary_power milestone requires durationHours > 0.");
    }
    if (!(rewardValue > 0)) {
      throw new Error("temporary_power milestone requires power amount (rewardValue) > 0.");
    }
    if (minerId != null) throw new Error("temporary_power milestone cannot include minerId.");
    validityDays = Math.max(1, Math.ceil(durationHours / 24));
  } else if (rewardType === REWARD_MACHINE) {
    if (!minerId) throw new Error("machine milestone requires minerId from catalog.");
    validityDays = 1;
    durationHours = null;
  }

  const active = b.active !== false;
  const sortOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0;

  return {
    dayThreshold,
    rewardType,
    rewardValue: new Prisma.Decimal(String(rewardValue)),
    validityDays,
    displayTitle: null,
    description: null,
    active,
    sortOrder,
    minerId,
    itemCode: null,
    metadataJson: parseMetadata(durationHours),
  };
}

export async function assertMinerExistsForMilestone(
  prisma: PrismaClient,
  minerId: number,
): Promise<void> {
  const miner = await prisma.miner.findFirst({
    where: { id: minerId, isActive: true, isArchived: false },
    select: { id: true },
  });
  if (!miner) {
    throw new Error("minerId must reference an active catalog machine.");
  }
}
