import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
const Decimal = Prisma.Decimal;
import prisma from "../../src/db/prisma.js";
import * as repo from "./ptc.repository.js";

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings() {
  return repo.getSettings();
}

export async function updateSettings(data: {
  pricePerViewShib?: number;
  rewardPerViewShib?: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  minViews?: number;
  maxViews?: number;
  isEnabled?: boolean;
}) {
  return repo.updateSettings(data);
}

// ── Ad Tiers ─────────────────────────────────────────────────────────────────

export async function getTiers() {
  return repo.getTiers();
}

export async function getActiveTiers() {
  return repo.getActiveTiers();
}

export async function createTier(data: {
  label: string;
  durationSeconds: number;
  pricePerViewShib: number;
  rewardPerViewShib: number;
  isActive?: boolean;
  sortOrder?: number;
}) {
  return repo.createTier({
    label: data.label,
    durationSeconds: data.durationSeconds,
    pricePerViewShib: data.pricePerViewShib,
    rewardPerViewShib: data.rewardPerViewShib,
    isActive: data.isActive ?? true,
    sortOrder: data.sortOrder ?? 0,
  });
}

export async function updateTier(
  id: number,
  data: {
    label?: string;
    durationSeconds?: number;
    pricePerViewShib?: number;
    rewardPerViewShib?: number;
    isActive?: boolean;
    sortOrder?: number;
  },
) {
  return repo.updateTier(id, data);
}

export async function deleteTier(id: number) {
  const tier = await repo.getTierById(id);
  if (!tier) throw new Error("Tier not found");
  return repo.deleteTier(id);
}

// ── Campaign creation ─────────────────────────────────────────────────────────

export async function createCampaign(
  userId: number,
  input: {
    title: string;
    description: string;
    url: string;
    adType: "iframe" | "window";
    tierId: number;
    targetViews: number;
  },
) {
  const settings = await repo.getSettings();
  if (!settings.isEnabled) throw new Error("PTC system is currently disabled");

  const tier = await repo.getTierById(input.tierId);
  if (!tier || !tier.isActive) throw new Error("Selected tier is not available");

  const { minViews, maxViews } = settings;
  if (input.targetViews < minViews || input.targetViews > maxViews) {
    throw new Error(`Views must be between ${minViews} and ${maxViews}`);
  }

  const pricePerView = new Decimal(tier.pricePerViewShib.toString());
  const costShib = pricePerView.mul(input.targetViews);
  const rewardPerViewShib = new Decimal(tier.rewardPerViewShib.toString());

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    if (new Decimal(user.shibBalance.toString()).lt(costShib)) {
      throw new Error("Insufficient SHIB balance");
    }

    await tx.user.update({
      where: { id: userId },
      data: { shibBalance: { decrement: costShib } },
    });

    const hash = crypto.randomBytes(8).toString("hex");
    await tx.ptpAd.create({
      data: {
        userId,
        tierId: tier.id,
        title: input.title,
        description: input.description,
        url: input.url,
        hash,
        adType: input.adType,
        durationSeconds: tier.durationSeconds,
        targetViews: input.targetViews,
        costShib,
        rewardPerViewShib,
        status: "pending_approval",
      },
    });
  });
}

// ── Campaign management (user) ────────────────────────────────────────────────

export async function editCampaign(
  userId: number,
  adId: number,
  data: { title?: string; description?: string; active?: boolean },
) {
  const ad = await repo.getCampaignById(adId);
  if (!ad || ad.userId !== userId) throw new Error("Campaign not found");
  if (ad.status === "completed" || ad.status === "rejected") {
    throw new Error("Cannot edit a completed or rejected campaign");
  }

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.active !== undefined) {
    if (ad.status === "active" && !data.active) updateData.status = "paused";
    if (ad.status === "paused" && data.active) updateData.status = "active";
  }

  return repo.updateCampaign(adId, updateData);
}

export async function addViews(userId: number, adId: number, extraViews: number) {
  const settings = await repo.getSettings();
  const ad = await repo.getCampaignById(adId);
  if (!ad || ad.userId !== userId) throw new Error("Campaign not found");
  if (ad.status === "completed" || ad.status === "rejected") {
    throw new Error("Cannot add views to a completed or rejected campaign");
  }

  const newTotal = ad.targetViews + extraViews;
  if (newTotal > settings.maxViews) throw new Error(`Max views is ${settings.maxViews}`);

  // Derive price from tier if available, else from original cost ratio
  let pricePerView: InstanceType<typeof Decimal>;
  if (ad.tierId) {
    const tier = await repo.getTierById(ad.tierId);
    pricePerView = new Decimal(tier ? tier.pricePerViewShib.toString() : ad.costShib.toString()).div(ad.targetViews || 1);
  } else {
    pricePerView = ad.targetViews > 0
      ? new Decimal(ad.costShib.toString()).div(ad.targetViews)
      : new Decimal(settings.pricePerViewShib.toString());
  }
  const costShib = pricePerView.mul(extraViews);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");
    if (new Decimal(user.shibBalance.toString()).lt(costShib)) throw new Error("Insufficient SHIB balance");

    await tx.user.update({ where: { id: userId }, data: { shibBalance: { decrement: costShib } } });
    await tx.ptpAd.update({
      where: { id: adId },
      data: { targetViews: { increment: extraViews }, costShib: { increment: costShib } },
    });
  });
}

export async function removeViews(userId: number, adId: number, reduceViews: number) {
  const settings = await repo.getSettings();
  const ad = await repo.getCampaignById(adId);
  if (!ad || ad.userId !== userId) throw new Error("Campaign not found");
  if (ad.status === "completed" || ad.status === "rejected") {
    throw new Error("Cannot modify a completed or rejected campaign");
  }

  const minAfterReduction = ad.views;
  const newTarget = ad.targetViews - reduceViews;
  if (newTarget < minAfterReduction) {
    throw new Error(`Cannot reduce below delivered views (${minAfterReduction})`);
  }
  if (newTarget < settings.minViews) throw new Error(`Min views is ${settings.minViews}`);

  const pricePerView = ad.targetViews > 0
    ? new Decimal(ad.costShib.toString()).div(ad.targetViews)
    : new Decimal(settings.pricePerViewShib.toString());
  const refundShib = pricePerView.mul(reduceViews);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { shibBalance: { increment: refundShib } } });
    await tx.ptpAd.update({
      where: { id: adId },
      data: { targetViews: { decrement: reduceViews }, costShib: { decrement: refundShib } },
    });
  });
}

// ── Admin approval ────────────────────────────────────────────────────────────

export async function approveCampaign(adId: number) {
  const ad = await repo.getCampaignById(adId);
  if (!ad) throw new Error("Campaign not found");
  if (ad.status !== "pending_approval") throw new Error("Campaign is not pending approval");
  return repo.updateCampaign(adId, { status: "active" });
}

export async function rejectCampaign(adId: number, reason: string) {
  const ad = await repo.getCampaignById(adId);
  if (!ad) throw new Error("Campaign not found");
  if (ad.status !== "pending_approval") throw new Error("Campaign is not pending approval");

  const undelivered = ad.targetViews - ad.views;
  const refundShib = ad.targetViews > 0
    ? new Decimal(ad.costShib.toString()).div(ad.targetViews).mul(undelivered)
    : new Decimal(0);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: ad.userId }, data: { shibBalance: { increment: refundShib } } });
    await tx.ptpAd.update({ where: { id: adId }, data: { status: "rejected", rejectionReason: reason } });
  });
}

// ── View tracking ─────────────────────────────────────────────────────────────

export async function trackView(viewerUserId: number, adId: number, viewerHash: string) {
  await prisma.$transaction(async (tx) => {
    const ad = await tx.ptpAd.findUnique({ where: { id: adId } });
    if (!ad || ad.status !== "active") throw new Error("Ad not available");
    if (ad.userId === viewerUserId) throw new Error("Cannot view your own ad");

    const alreadySeen = await tx.ptpView.findUnique({
      where: { adId_viewerHash: { adId, viewerHash } },
    });
    if (alreadySeen) throw new Error("Already viewed");

    const newViews = ad.views + 1;
    const isCompleted = newViews >= ad.targetViews;
    const earnedShib = new Decimal(ad.rewardPerViewShib.toString());

    await tx.ptpView.create({ data: { adId, viewerHash, earnedShib } });
    await tx.ptpAd.update({
      where: { id: adId },
      data: { views: newViews, status: isCompleted ? "completed" : "active" },
    });
    await tx.ptpEarning.create({ data: { userId: viewerUserId, adId, amountShib: earnedShib } });
    await tx.user.update({ where: { id: viewerUserId }, data: { shibBalance: { increment: earnedShib } } });
  });
}

// ── Getters ───────────────────────────────────────────────────────────────────

export async function getMyCampaigns(userId: number) {
  return repo.getCampaignsByUser(userId);
}

export async function getNextAd(viewerUserId: number) {
  const viewerHash = `user_${viewerUserId}`;
  return repo.getNextAdForViewer(viewerHash);
}

export async function getEarningsHistory(userId: number) {
  return repo.getUserEarnings(userId, 50);
}
