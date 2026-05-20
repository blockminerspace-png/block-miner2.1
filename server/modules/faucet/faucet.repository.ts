import type { FaucetClaim } from "@prisma/client";
import prisma from "../../src/db/prisma.js";

export async function findActiveFaucetReward() {
  return prisma.faucetReward.findFirst({
    where: { isActive: true },
    include: { miner: true },
    orderBy: { id: "asc" },
  });
}

export async function findFaucetClaimByUserId(userId: number) {
  return prisma.faucetClaim.findUnique({ where: { userId } });
}

export async function resetFaucetClaimDayKey(userId: number, todayKey: string): Promise<FaucetClaim> {
  return prisma.faucetClaim.update({
    where: { userId },
    data: { totalClaims: 0, dayKey: todayKey },
  });
}

export async function findFaucetPartnerVisit(userId: number, dayKey: string) {
  return prisma.faucetPartnerVisit.findUnique({
    where: { userId_dayKey: { userId, dayKey } },
  });
}

export async function upsertFaucetPartnerVisit(
  userId: number,
  dayKey: string,
  openedAt: Date,
  eligibleAt: Date,
) {
  const now = new Date();
  return prisma.faucetPartnerVisit.upsert({
    where: { userId_dayKey: { userId, dayKey } },
    update: { openedAt, eligibleAt, updatedAt: now },
    create: { userId, dayKey, openedAt, eligibleAt },
  });
}
