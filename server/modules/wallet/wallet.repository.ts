import crypto from "node:crypto";
import prisma from "../../src/db/prisma.js";
import { WALLET_LINK_CALLBACK_TYPE } from "./wallet.types.js";

function linkChallengeHash(userId: number, addressLower: string): string {
  return crypto.createHash("sha256").update(`wallet_link:${userId}:${addressLower}`, "utf8").digest("hex");
}

export async function getUserWalletAddress(userId: number): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { walletAddress: true },
  });
  return user?.walletAddress ?? null;
}

export async function saveUserWallet(userId: number, address: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { walletAddress: address },
  });
}

export async function removeUserWallet(userId: number): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { walletAddress: null },
  });
}

export async function invalidateWalletLinkChallenges(userId: number, addressLower: string): Promise<void> {
  const hash = linkChallengeHash(userId, addressLower);
  await prisma.callbackQueue.updateMany({
    where: {
      callbackType: WALLET_LINK_CALLBACK_TYPE,
      userId,
      callbackHash: hash,
      status: "pending",
    },
    data: { status: "cancelled", processedAt: new Date() },
  });
}

export async function createWalletLinkChallenge(
  userId: number,
  address: string,
  chainId: number,
  message: string,
  nonce: string,
  expiresAtMs: number,
): Promise<number> {
  const addressLower = address.toLowerCase();
  await invalidateWalletLinkChallenges(userId, addressLower);
  const row = await prisma.callbackQueue.create({
    data: {
      callbackType: WALLET_LINK_CALLBACK_TYPE,
      userId,
      callbackHash: linkChallengeHash(userId, addressLower),
      status: "pending",
      data: {
        address,
        addressLower,
        chainId,
        message,
        nonce,
        expiresAtMs,
      },
    },
  });
  return row.id;
}

type ChallengeData = {
  address?: string;
  addressLower?: string;
  chainId?: number;
  message?: string;
  nonce?: string;
  expiresAtMs?: number;
};

export async function findValidWalletLinkChallenge(
  userId: number,
  addressLower: string,
): Promise<{
  id: number;
  message: string;
  nonce: string;
  address: string;
  chainId: number;
} | null> {
  const hash = linkChallengeHash(userId, addressLower);
  const row = await prisma.callbackQueue.findFirst({
    where: {
      callbackType: WALLET_LINK_CALLBACK_TYPE,
      userId,
      callbackHash: hash,
      status: "pending",
    },
    orderBy: { createdAt: "desc" },
  });
  if (!row?.data || typeof row.data !== "object") return null;
  const data = row.data as ChallengeData;
  const expiresAtMs = Number(data.expiresAtMs ?? 0);
  if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) return null;
  const message = typeof data.message === "string" ? data.message : "";
  const nonce = typeof data.nonce === "string" ? data.nonce : "";
  const address = typeof data.address === "string" ? data.address : "";
  const chainId = Number(data.chainId);
  if (!message || !nonce || !address || !Number.isFinite(chainId)) return null;
  return { id: row.id, message, nonce, address, chainId };
}

export async function markWalletLinkChallengeUsed(challengeId: number): Promise<void> {
  await prisma.callbackQueue.update({
    where: { id: challengeId },
    data: { status: "completed", processedAt: new Date() },
  });
}

export async function listDepositsForUser(userId: number) {
  return prisma.transaction.findMany({
    where: { userId, type: "deposit" },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function findDepositByHashForUser(txHash: string, userId: number) {
  return prisma.transaction.findFirst({
    where: { txHash, userId, type: "deposit" },
  });
}

export async function findDepositClaimByHash(txHash: string, excludeUserId: number) {
  return prisma.transaction.findFirst({
    where: {
      txHash,
      type: "deposit",
      status: { in: ["completed", "pending_verification"] },
      userId: { not: excludeUserId },
    },
  });
}

export async function findAnyDepositByHash(txHash: string) {
  return prisma.transaction.findFirst({
    where: { txHash, type: "deposit" },
  });
}

export const WITHDRAWAL_FEE_PERCENT = 2.5;
export const WITHDRAWAL_FEE_WAIVER_REQUIRED = 10;

/** Counts all offerwall/ad completions today (UTC) — used for withdrawal fee waiver.
 *  Includes: offerwall.me credits + zerads PTC ads viewed + internal offerwall (iframe) completions.
 *
 *  Zerads batches multiple ad clicks per callback (1 row can represent 1..N ads viewed),
 *  so we SUM the `clicks` column instead of counting rows. Other providers are 1:1. */
export async function countTodayOfferwallCompletions(userId: number): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [offerwallMe, internalOw, zeradsAgg] = await Promise.all([
    (prisma as any).offerwallMeCallback.count({
      where: { userId, status: 1, createdAt: { gte: startOfDay } },
    }),
    prisma.internalOfferwallAttempt.count({
      where: { userId, status: "COMPLETED", completedAt: { gte: startOfDay } },
    }),
    prisma.zeradsCallback.aggregate({
      where: { userId, callbackAt: { gte: startOfDay } },
      _sum: { clicks: true },
    }),
  ]);
  const zeradsClicks = Number(zeradsAgg._sum?.clicks ?? 0);
  return (offerwallMe as number) + internalOw + zeradsClicks;
}
