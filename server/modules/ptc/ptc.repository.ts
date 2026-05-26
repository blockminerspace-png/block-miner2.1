import prisma from "../../src/db/prisma.js";
import type { Prisma } from "@prisma/client";

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings() {
  return prisma.ptcSettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
}

export async function updateSettings(data: Prisma.PtcSettingsUpdateInput) {
  return prisma.ptcSettings.update({ where: { id: 1 }, data });
}

// ── Ad Tiers ─────────────────────────────────────────────────────────────────

export async function getTiers() {
  return prisma.ptcAdTier.findMany({ orderBy: [{ sortOrder: "asc" }, { durationSeconds: "asc" }] });
}

export async function getActiveTiers() {
  return prisma.ptcAdTier.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { durationSeconds: "asc" }],
  });
}

export async function getTierById(id: number) {
  return prisma.ptcAdTier.findUnique({ where: { id } });
}

export async function createTier(data: Prisma.PtcAdTierCreateInput) {
  return prisma.ptcAdTier.create({ data });
}

export async function updateTier(id: number, data: Prisma.PtcAdTierUpdateInput) {
  return prisma.ptcAdTier.update({ where: { id }, data });
}

export async function deleteTier(id: number) {
  return prisma.ptcAdTier.delete({ where: { id } });
}

// ── Campaigns ────────────────────────────────────────────────────────────────

export async function createCampaign(data: Prisma.PtpAdCreateInput) {
  return prisma.ptpAd.create({ data });
}

export async function getCampaignById(id: number) {
  return prisma.ptpAd.findUnique({ where: { id } });
}

export async function getCampaignsByUser(userId: number) {
  return prisma.ptpAd.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateCampaign(id: number, data: Prisma.PtpAdUpdateInput) {
  return prisma.ptpAd.update({ where: { id }, data });
}

export async function getPendingCampaigns() {
  return prisma.ptpAd.findMany({
    where: { status: "pending_approval" },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getAllCampaignsAdmin(page: number, limit: number) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.ptpAd.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.ptpAd.count(),
  ]);
  return { items, total, page, limit };
}

// ── View tracking ────────────────────────────────────────────────────────────

export async function hasViewed(adId: number, viewerHash: string) {
  return prisma.ptpView.findUnique({
    where: { adId_viewerHash: { adId, viewerHash } },
  });
}

export async function recordView(
  tx: Prisma.TransactionClient,
  adId: number,
  viewerHash: string,
  earnedShib: number,
) {
  return tx.ptpView.create({ data: { adId, viewerHash, earnedShib } });
}

export async function recordEarning(
  tx: Prisma.TransactionClient,
  userId: number,
  adId: number,
  amountShib: number,
) {
  return tx.ptpEarning.create({ data: { userId, adId, amountShib } });
}

// ── Next ad for viewer ───────────────────────────────────────────────────────

export async function getNextAdForViewer(viewerHash: string) {
  // Active ads the viewer hasn't seen yet
  const seen = await prisma.ptpView.findMany({
    where: { viewerHash },
    select: { adId: true },
  });
  const seenIds = seen.map((v) => v.adId);

  return prisma.ptpAd.findFirst({
    where: {
      status: "active",
      id: seenIds.length > 0 ? { notIn: seenIds } : undefined,
    },
    orderBy: { createdAt: "asc" },
  });
}

// ── Earnings history ─────────────────────────────────────────────────────────

export async function getUserEarnings(userId: number, limit = 20) {
  return prisma.ptpEarning.findMany({
    where: { userId },
    orderBy: { paidAt: "desc" },
    take: limit,
    include: { user: false },
  });
}
