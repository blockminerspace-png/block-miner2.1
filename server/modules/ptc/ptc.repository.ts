import prisma from "../../src/db/prisma.js";
import type { Prisma } from "@prisma/client";
import { utcDateFromNow, wasViewedOnUtcDate } from "./ptc.utc.js";

export async function findViewBlockedForToday(adId: number, viewerHash: string, now = new Date()) {
  const view = await prisma.ptpView.findUnique({
    where: { adId_viewerHash: { adId, viewerHash } },
  });
  if (!view) return null;
  if (wasViewedOnUtcDate(view.lastViewedUtcDate, view.viewedAt, now)) return view;
  return null;
}

export async function findViewBlockedForTodayTx(
  tx: Prisma.TransactionClient,
  adId: number,
  viewerHash: string,
  now = new Date(),
) {
  const view = await tx.ptpView.findUnique({
    where: { adId_viewerHash: { adId, viewerHash } },
  });
  if (!view) return null;
  if (wasViewedOnUtcDate(view.lastViewedUtcDate, view.viewedAt, now)) return view;
  return null;
}

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

export async function recordView(
  tx: Prisma.TransactionClient,
  adId: number,
  viewerHash: string,
  earnedShib: number,
  viewedAt: Date,
) {
  const lastViewedUtcDate = utcDateFromNow(viewedAt);
  return tx.ptpView.upsert({
    where: { adId_viewerHash: { adId, viewerHash } },
    create: { adId, viewerHash, earnedShib, viewedAt, lastViewedUtcDate },
    update: { earnedShib, viewedAt, lastViewedUtcDate },
  });
}

export async function recordEarning(
  tx: Prisma.TransactionClient,
  userId: number,
  adId: number,
  amountShib: number,
) {
  return tx.ptpEarning.create({ data: { userId, adId, amountShib } });
}

// ── Available ads for viewer ─────────────────────────────────────────────────

export async function getAdsForViewer(userId: number, now = new Date()) {
  const viewerHash = `user_${userId}`;

  const [views, ads] = await Promise.all([
    prisma.ptpView.findMany({
      where: { viewerHash },
      select: { adId: true, lastViewedUtcDate: true, viewedAt: true },
    }),
    prisma.ptpAd.findMany({
      where: {
        status: "active",
        userId: { not: userId },
      },
      select: {
        id: true,
        title: true,
        description: true,
        url: true,
        adType: true,
        durationSeconds: true,
        rewardPerViewShib: true,
        views: true,
        targetViews: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const viewedTodayIds = new Set(
    views
      .filter((v) => wasViewedOnUtcDate(v.lastViewedUtcDate, v.viewedAt, now))
      .map((v) => v.adId),
  );

  return ads.map((ad) => ({
    ...ad,
    viewedToday: viewedTodayIds.has(ad.id),
    availableToday: !viewedTodayIds.has(ad.id),
  }));
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

// ── PTC Sessions ─────────────────────────────────────────────────────────────

export async function createSession(data: {
  userId: number;
  adId: number;
  viewerHash: string;
  requiredSeconds: number;
}) {
  return prisma.ptpSession.create({ data: { ...data, status: "opening" } });
}

export async function getSessionById(id: string) {
  return prisma.ptpSession.findUnique({ where: { id } });
}

export async function listOpenSessionsForUser(userId: number) {
  return prisma.ptpSession.findMany({
    where: { userId, status: { in: ["opening", "viewing", "paused", "completed"] } },
    orderBy: { startedAt: "desc" },
  });
}

export async function getActiveSessionForUser(userId: number) {
  return prisma.ptpSession.findFirst({
    where: { userId, status: { in: ["opening", "viewing", "paused", "completed"] } },
    include: {
      ad: { select: { id: true, title: true, url: true, adType: true, durationSeconds: true, rewardPerViewShib: true, status: true, userId: true } },
    },
    orderBy: { startedAt: "desc" },
  });
}

export async function updateSession(
  id: string,
  data: Partial<{
    status: string;
    accumulatedMs: number;
    lastHeartbeatAt: Date;
    completedAt: Date;
    claimedAt: Date;
    cancelReason: string;
  }>,
) {
  return prisma.ptpSession.update({ where: { id }, data });
}

export async function cancelActiveSessionsForUser(userId: number) {
  return prisma.ptpSession.updateMany({
    where: { userId, status: { in: ["opening", "viewing", "paused"] } },
    data: { status: "cancelled", cancelReason: "superseded" },
  });
}
