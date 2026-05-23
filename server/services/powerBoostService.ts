import prisma from "../src/db/prisma.js";

export const BOOST_COST_POL = 0.10;
export const BOOST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const NORMAL_TTL_MS = 24 * 60 * 60 * 1000;

export function todayKeyUTC(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function hasActiveBoost(userId: number): Promise<boolean> {
  const row = await prisma.dailyPowerBoost.findUnique({
    where: { userId_dayKey: { userId, dayKey: todayKeyUTC() } },
    select: { id: true },
  });
  return row != null;
}

export async function getBoostTtlMs(userId: number): Promise<number> {
  return (await hasActiveBoost(userId)) ? BOOST_TTL_MS : NORMAL_TTL_MS;
}

export type ActivateResult =
  | { ok: true; dayKey: string; polBalance: number }
  | { ok: false; code: "ALREADY_ACTIVE" | "INSUFFICIENT_BALANCE"; message: string };

export async function activateBoost(userId: number): Promise<ActivateResult> {
  const dayKey = todayKeyUTC();

  return prisma.$transaction(async (tx) => {
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

    return { ok: true, dayKey, polBalance: Number(updated.polBalance) } as const;
  });
}
