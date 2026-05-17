import prisma from "../../src/db/prisma.js";

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
