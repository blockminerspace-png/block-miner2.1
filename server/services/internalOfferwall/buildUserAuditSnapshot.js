import prisma from "../../src/db/prisma.js";

/**
 * Compact JSON snapshot for compliance / support (no passwords).
 * @param {number} userId
 * @returns {Promise<string>}
 */
export async function buildUserAuditSnapshotJson(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      walletAddress: true,
      polBalance: true,
      blkBalance: true,
      createdAt: true,
      miners: {
        take: 20,
        where: { isActive: true },
        select: {
          id: true,
          slotIndex: true,
          imageUrl: true,
          level: true,
          hashRate: true,
          miner: { select: { name: true, slug: true } }
        }
      },
      inventory: {
        take: 15,
        select: {
          id: true,
          minerName: true,
          imageUrl: true,
          level: true
        }
      },
      _count: {
        select: {
          transactions: true,
          payouts: true
        }
      }
    }
  });
  if (!user) return JSON.stringify({ error: "user_not_found", userId });
  const activeMinerSample = user.miners.map((m) => ({
    id: m.id,
    slotIndex: m.slotIndex,
    minerName: m.miner?.name ?? null,
    minerSlug: m.miner?.slug ?? null,
    imageUrl: m.imageUrl,
    level: m.level,
    hashRate: m.hashRate
  }));
  const snap = {
    userId: user.id,
    email: user.email,
    username: user.username,
    walletAddress: user.walletAddress,
    polBalance: user.polBalance?.toString?.() ?? String(user.polBalance),
    blkBalance: user.blkBalance?.toString?.() ?? String(user.blkBalance),
    createdAt: user.createdAt?.toISOString?.() ?? null,
    activeMinerSample,
    inventorySample: user.inventory,
    transactionCount: user._count.transactions,
    payoutCount: user._count.payouts,
    capturedAt: new Date().toISOString()
  };
  const s = JSON.stringify(snap);
  if (s.length > 60000) return s.slice(0, 60000);
  return s;
}
