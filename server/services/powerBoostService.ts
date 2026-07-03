import type { Prisma } from "@prisma/client";
import { Prisma as PrismaNs } from "@prisma/client";
import prisma from "../src/db/prisma.js";

export const BOOST_COST_POL = 0.01;
export const NORMAL_TTL_MS = 24 * 60 * 60 * 1000;
export const BOOST_TTL_MS = 7 * NORMAL_TTL_MS;
export const NORMAL_DURATION_HOURS = 24;
export const BOOST_DURATION_HOURS = 168;

export const POWER_BOOST_REWARD_SYSTEMS = [
  "faucet",
  "shortlinks",
  "youtube",
  "autoMining",
] as const;

export type PowerBoostRewardSystem = (typeof POWER_BOOST_REWARD_SYSTEMS)[number];

export function todayKeyUTC(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** When today's UTC entitlement ends (next UTC midnight). */
export function boostEntitlementExpiresAt(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
}

/** Single source of truth: reward TTL from earnedAt + durationMs (exact ms, no calendar drift). */
export function computeRewardExpiresAt(earnedAt: Date, durationMs: number): Date {
  return new Date(earnedAt.getTime() + durationMs);
}

export function rewardDurationHoursFromMs(durationMs: number): number {
  return durationMs / (60 * 60 * 1000);
}

export function formatRewardDurationPt(durationMs: number): string {
  const hours = rewardDurationHoursFromMs(durationMs);
  if (hours >= 24 && Number.isInteger(hours / 24)) {
    const days = hours / 24;
    return days === 1 ? "24 horas" : `${days} dias`;
  }
  return `${hours} horas`;
}

export async function hasActiveBoostTx(
  tx: Prisma.TransactionClient,
  userId: number,
  dayKey = todayKeyUTC(),
): Promise<boolean> {
  const row = await tx.dailyPowerBoost.findUnique({
    where: { userId_dayKey: { userId, dayKey } },
    select: { id: true },
  });
  return row != null;
}

export async function hasActiveBoost(userId: number): Promise<boolean> {
  const row = await prisma.dailyPowerBoost.findUnique({
    where: { userId_dayKey: { userId, dayKey: todayKeyUTC() } },
    select: { id: true },
  });
  return row != null;
}

/**
 * Central reward-duration decision for all systems (faucet, shortlinks, YouTube, auto-mining).
 * @param _rewardType reserved for per-system overrides; currently identical for all.
 */
export async function getRewardDurationMs(
  userId: number,
  _rewardType?: PowerBoostRewardSystem,
): Promise<number> {
  return (await hasActiveBoost(userId)) ? BOOST_TTL_MS : NORMAL_TTL_MS;
}

/** Use inside Prisma transactions so TTL matches the same DB snapshot as the grant row. */
export async function getRewardDurationMsTx(
  tx: Prisma.TransactionClient,
  userId: number,
  _rewardType?: PowerBoostRewardSystem,
): Promise<number> {
  return (await hasActiveBoostTx(tx, userId)) ? BOOST_TTL_MS : NORMAL_TTL_MS;
}

/** @deprecated Use getRewardDurationMs */
export const getBoostTtlMs = getRewardDurationMs;

export type PowerBoostStatus = {
  active: boolean;
  dayKey: string;
  costPol: number;
  entitlementExpiresAt: string | null;
  currentRewardDurationHours: number;
  normalRewardDurationHours: number;
  boostedRewardDurationHours: number;
};

export async function getPowerBoostStatus(userId: number): Promise<PowerBoostStatus> {
  const dayKey = todayKeyUTC();
  const active = await hasActiveBoost(userId);
  return {
    active,
    dayKey,
    costPol: BOOST_COST_POL,
    entitlementExpiresAt: active ? boostEntitlementExpiresAt().toISOString() : null,
    currentRewardDurationHours: active ? BOOST_DURATION_HOURS : NORMAL_DURATION_HOURS,
    normalRewardDurationHours: NORMAL_DURATION_HOURS,
    boostedRewardDurationHours: BOOST_DURATION_HOURS,
  };
}

export type ActivateResult =
  | { ok: true; dayKey: string; polBalance: number; entitlementExpiresAt: string }
  | { ok: false; code: "ALREADY_ACTIVE" | "INSUFFICIENT_BALANCE"; message: string };

function isUniqueViolation(err: unknown): boolean {
  return err instanceof PrismaNs.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function activateBoost(userId: number): Promise<ActivateResult> {
  const dayKey = todayKeyUTC();

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.dailyPowerBoost.findUnique({
        where: { userId_dayKey: { userId, dayKey } },
        select: { id: true },
      });
      if (existing) {
        return { ok: false, code: "ALREADY_ACTIVE", message: "Power boost já ativo hoje." } as const;
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { polBalance: true },
      });
      const balance = Number(user?.polBalance ?? 0);
      if (balance < BOOST_COST_POL) {
        return { ok: false, code: "INSUFFICIENT_BALANCE", message: "Saldo POL insuficiente." } as const;
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: { polBalance: { decrement: BOOST_COST_POL } },
        select: { polBalance: true },
      });

      await tx.dailyPowerBoost.create({
        data: { userId, dayKey, amountPol: BOOST_COST_POL },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: "power_boost_activated",
          detailsJson: JSON.stringify({
            dayKey,
            amountPol: BOOST_COST_POL,
            balanceAfter: Number(updated.polBalance),
            entitlementExpiresAt: boostEntitlementExpiresAt().toISOString(),
          }),
        },
      });

      return {
        ok: true,
        dayKey,
        polBalance: Number(updated.polBalance),
        entitlementExpiresAt: boostEntitlementExpiresAt().toISOString(),
      } as const;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, code: "ALREADY_ACTIVE", message: "Power boost já ativo hoje." } as const;
    }
    throw err;
  }
}
