import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
const Decimal = Prisma.Decimal;
import prisma from "../../src/db/prisma.js";
import * as repo from "./ptc.repository.js";
import { SESSION_CLAIM_WINDOW_MS, SESSION_STALE_MS } from "./ptc.config.js";

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
  adType?: string;
  durationSeconds: number;
  pricePerViewShib: number;
  rewardPerViewShib: number;
  isActive?: boolean;
  sortOrder?: number;
}) {
  return repo.createTier({
    label: data.label,
    adType: data.adType ?? "window",
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
    adType?: string;
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
    tierId: number;
    targetViews: number;
  },
) {
  const settings = await repo.getSettings();
  if (!settings.isEnabled) throw new Error("PTC system is currently disabled");

  const tier = await repo.getTierById(input.tierId);
  if (!tier || !tier.isActive) throw new Error("Selected option is not available");

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
        adType: tier.adType,
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

// ── Session-based view tracking ───────────────────────────────────────────────

const HEARTBEAT_MAX_GAP_MS = 15_000;

type OpenSessionRow = {
  id: string;
  status: string;
  lastHeartbeatAt: Date | null;
  startedAt: Date;
  completedAt: Date | null;
};

function isSessionStale(session: OpenSessionRow, now: Date): boolean {
  if (session.status === "completed") {
    if (!session.completedAt) return true;
    return now.getTime() - session.completedAt.getTime() > SESSION_CLAIM_WINDOW_MS;
  }
  const ref = session.lastHeartbeatAt ?? session.startedAt;
  return now.getTime() - ref.getTime() > SESSION_STALE_MS;
}

async function cleanupStaleSessionsForUser(userId: number, now = new Date()): Promise<void> {
  const sessions = await repo.listOpenSessionsForUser(userId);
  for (const session of sessions) {
    if (!isSessionStale(session, now)) continue;
    const reason = session.status === "completed" ? "claim_window_expired" : "heartbeat_timeout";
    await repo.updateSession(session.id, { status: "cancelled", cancelReason: reason });
    console.info(`[PTC] session_stale_cancelled userId=${userId} sessionId=${session.id} reason=${reason}`);
  }
}

export async function startSession(userId: number, adId: number) {
  await cleanupStaleSessionsForUser(userId);

  const existing = await repo.getActiveSessionForUser(userId);
  if (existing) {
    throw new Error("Você já possui um anúncio ativo. Conclua-o antes de iniciar outro.");
  }

  const ad = await repo.getCampaignById(adId);
  if (!ad || ad.status !== "active") throw new Error("Anúncio não disponível");
  if (ad.userId === userId) throw new Error("Você não pode visualizar seu próprio anúncio");

  const viewerHash = `user_${userId}`;
  const inCooldown = await repo.findViewInCooldown(adId, viewerHash);
  if (inCooldown) throw new Error("Este anúncio ainda está em cooldown. Tente novamente mais tarde.");

  const session = await repo.createSession({ userId, adId, viewerHash, requiredSeconds: ad.durationSeconds });
  console.info(`[PTC] session_started userId=${userId} adId=${adId} sessionId=${session.id} requiredSeconds=${ad.durationSeconds}`);
  return session;
}

export async function heartbeat(sessionId: string, userId: number) {
  const session = await repo.getSessionById(sessionId);
  if (!session || session.userId !== userId) throw new Error("Sessão não encontrada");

  if (session.status === "claimed") throw new Error("Sessão já foi resgatada");
  if (session.status === "cancelled") throw new Error("Sessão cancelada");
  if (session.status === "completed") return session;

  const now = new Date();
  let deltaMs = 0;
  if (session.status === "viewing" && session.lastHeartbeatAt) {
    deltaMs = Math.min(now.getTime() - session.lastHeartbeatAt.getTime(), HEARTBEAT_MAX_GAP_MS);
  }

  const newAccumulatedMs = session.accumulatedMs + deltaMs;
  const isComplete = newAccumulatedMs / 1000 >= session.requiredSeconds;

  const updated = await repo.updateSession(sessionId, {
    status: isComplete ? "completed" : "viewing",
    accumulatedMs: newAccumulatedMs,
    lastHeartbeatAt: now,
    ...(isComplete ? { completedAt: now } : {}),
  });

  if (isComplete) {
    console.info(`[PTC] session_completed userId=${userId} sessionId=${sessionId} accumulatedMs=${newAccumulatedMs}`);
  }
  return updated;
}

export async function pauseSession(sessionId: string, userId: number) {
  const session = await repo.getSessionById(sessionId);
  if (!session || session.userId !== userId) throw new Error("Sessão não encontrada");

  if (["completed", "cancelled", "claimed"].includes(session.status)) return session;

  const now = new Date();
  let deltaMs = 0;
  if (session.status === "viewing" && session.lastHeartbeatAt) {
    deltaMs = Math.min(now.getTime() - session.lastHeartbeatAt.getTime(), HEARTBEAT_MAX_GAP_MS);
  }

  const newAccumulatedMs = session.accumulatedMs + deltaMs;
  const isComplete = newAccumulatedMs / 1000 >= session.requiredSeconds;

  const updated = await repo.updateSession(sessionId, {
    status: isComplete ? "completed" : "paused",
    accumulatedMs: newAccumulatedMs,
    lastHeartbeatAt: now,
    ...(isComplete ? { completedAt: now } : {}),
  });

  console.info(`[PTC] session_paused userId=${userId} sessionId=${sessionId} accumulatedMs=${newAccumulatedMs} isComplete=${isComplete}`);
  return updated;
}

export async function cancelSession(sessionId: string, userId: number, reason: string) {
  const session = await repo.getSessionById(sessionId);
  if (!session || session.userId !== userId) return;
  if (session.status === "claimed") return;

  await repo.updateSession(sessionId, { status: "cancelled", cancelReason: reason });
  console.info(`[PTC] session_cancelled userId=${userId} sessionId=${sessionId} reason=${reason}`);
}

export async function claimSession(sessionId: string, userId: number) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const session = await tx.ptpSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new Error("Sessão não encontrada");
    if (session.status === "claimed") throw new Error("Recompensa já foi resgatada");
    if (session.status === "cancelled") throw new Error("Sessão cancelada — reinicie o anúncio");

    if (session.status !== "completed") {
      if (isSessionStale(session, now)) {
        await tx.ptpSession.update({
          where: { id: sessionId },
          data: { status: "cancelled", cancelReason: "heartbeat_timeout" },
        });
        throw new Error("Sessão expirada por inatividade — reinicie o anúncio");
      }
      throw new Error("Tempo de visualização ainda não concluído");
    }

    const inCooldown = await repo.findViewInCooldownTx(tx, session.adId, session.viewerHash, now);
    if (inCooldown) {
      await tx.ptpSession.update({
        where: { id: sessionId },
        data: { status: "cancelled", cancelReason: "already_viewed" },
      });
      throw new Error("Visualização já registrada");
    }

    const ad = await tx.ptpAd.findUnique({ where: { id: session.adId } });
    if (!ad || ad.status !== "active") {
      await tx.ptpSession.update({
        where: { id: sessionId },
        data: { status: "cancelled", cancelReason: "ad_unavailable" },
      });
      throw new Error("Anúncio não está mais disponível");
    }

    const earnedShib = new Decimal(ad.rewardPerViewShib.toString());
    const newViews = ad.views + 1;
    const isCompleted = newViews >= ad.targetViews;

    await repo.recordView(tx, session.adId, session.viewerHash, Number(earnedShib.toString()), now);
    await tx.ptpAd.update({
      where: { id: session.adId },
      data: { views: newViews, status: isCompleted ? "completed" : "active" },
    });
    await tx.ptpEarning.create({ data: { userId, adId: session.adId, amountShib: earnedShib } });
    await tx.user.update({ where: { id: userId }, data: { shibBalance: { increment: earnedShib } } });
    await tx.ptpSession.update({ where: { id: sessionId }, data: { status: "claimed", claimedAt: now } });

    console.info(`[PTC] reward_claimed userId=${userId} sessionId=${sessionId} earnedShib=${earnedShib.toString()}`);
  });
}

export async function getActiveSession(userId: number) {
  await cleanupStaleSessionsForUser(userId);

  const session = await repo.getActiveSessionForUser(userId);
  if (!session) return null;

  return session;
}

// ── Getters ───────────────────────────────────────────────────────────────────

export async function getMyCampaigns(userId: number) {
  return repo.getCampaignsByUser(userId);
}

export async function getAvailableAds(userId: number) {
  await cleanupStaleSessionsForUser(userId);
  return repo.getAdsForViewer(userId);
}

export async function getEarningsHistory(userId: number) {
  return repo.getUserEarnings(userId, 50);
}
