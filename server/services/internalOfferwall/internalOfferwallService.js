import { Prisma } from "../../src/db/prismaNamespace.js";
import prisma from "../../src/db/prisma.js";
import { getDailyTaskPeriodKey } from "../dailyTasks/dailyTaskPeriod.js";
import { bumpDailyTasksForUser } from "../dailyTasks/dailyTaskProgressService.js";
import { TASK_INTERNAL_OFFERWALL } from "../dailyTasks/dailyTaskConstants.js";
import { buildUserAuditSnapshotJson } from "./buildUserAuditSnapshot.js";
import { grantInternalOfferwallRewardInTx } from "./grantInternalOfferwallReward.js";
import {
  ATTEMPT_STATUS_COMPLETED,
  ATTEMPT_STATUS_PENDING_REVIEW,
  ATTEMPT_STATUS_REJECTED,
  ATTEMPT_STATUS_STARTED,
  COMPLETION_ADMIN_APPROVAL,
  COMPLETION_USER_SELF_CLAIM,
  OFFER_KIND_GENERAL_TASK,
  OFFER_KIND_PTC_IFRAME,
  REWARD_BLK,
  REWARD_HASHRATE_TEMP,
  REWARD_POL,
  RESET_TYPE_COOLDOWN,
  RESET_TYPE_DAILY
} from "./internalOfferwallConstants.js";
import {
  COMPLETION_HISTORY_LOOKBACK_MS,
  computeUsageSnapshot,
  getOfferLimitConfig
} from "./internalOfferwallLimitState.js";
import { isAllowHttpIframe, validateIframeUrl } from "./validateIframeUrl.js";
import { isInternalOfferwallEnabled } from "./internalOfferwallFeature.js";
import { advisoryXactTryLockOrThrow } from "../distributedLockService.js";
import { normalizeTaskMetadata } from "./internalOfferwallTaskMetadata.js";
import {
  getIframeHostAllowlistCachedSync,
  refreshIframeHostAllowlistCache,
  upsertActiveFrameHost
} from "./iframeHostAllowlistCache.js";
import { assertMinViewForSubmit } from "./internalOfferwallMinView.js";
import { notifyInternalOfferwallCompletion } from "./internalOfferwallCompletionWebhook.js";

/**
 * @param {unknown} v
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 */
function clampInt(v, min, max, fallback) {
  const n = parseInt(String(v ?? ""), 10);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Merges top-level admin fields into taskMetadata before normalization.
 * @param {Record<string, unknown>} b
 * @returns {unknown}
 */
function buildTaskMetadataInputForNormalize(b) {
  const metaIn = b.taskMetadata !== undefined ? b.taskMetadata : b.task_metadata;
  const base =
    metaIn != null && typeof metaIn === "object" && !Array.isArray(metaIn) ? { ...metaIn } : {};
  if (b.resetType !== undefined) base.resetType = b.resetType;
  if (b.cooldownSeconds !== undefined) base.cooldownSeconds = b.cooldownSeconds;
  return Object.keys(base).length ? base : null;
}

/**
 * @param {unknown} e
 */
function isPrismaSerializationConflict(e) {
  return Boolean(e && typeof e === "object" && "code" in e && /** @type {{ code?: string }} */ (e).code === "P2034");
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {object} body
 * @returns {Promise<{ ok: true, data: object } | { ok: false, status: number, message: string, code?: string, details?: { host: string } }>}
 */
export async function parseAdminOfferBody(prisma, body) {
  if (!body || typeof body !== "object") {
    return { ok: false, status: 400, message: "Invalid JSON body." };
  }
  const b = /** @type {Record<string, unknown>} */ (body);
  const kind = String(b.kind || "").trim().toUpperCase();
  if (kind !== OFFER_KIND_PTC_IFRAME && kind !== OFFER_KIND_GENERAL_TASK) {
    return { ok: false, status: 400, message: "Invalid offer kind." };
  }
  const title = String(b.title || "").trim();
  if (!title || title.length > 200) {
    return { ok: false, status: 400, message: "Title is required (max 200 chars)." };
  }
  const description =
    b.description === undefined || b.description === null
      ? null
      : String(b.description).trim().slice(0, 8000) || null;

  await refreshIframeHostAllowlistCache(prisma);
  const allowHttp = isAllowHttpIframe();

  let iframeUrl = null;
  if (kind === OFFER_KIND_PTC_IFRAME) {
    let hosts = getIframeHostAllowlistCachedSync();
    let vr = validateIframeUrl(String(b.iframeUrl || ""), {
      allowHttp,
      allowedHosts: hosts
    });
    if (!vr.ok && vr.code === "IFRAME_URL_NOT_ALLOWED" && vr.host) {
      const up = await upsertActiveFrameHost(prisma, vr.host);
      if (!up.ok) {
        return { ok: false, status: 400, message: up.message, code: "IFRAME_HOST_INVALID" };
      }
      await refreshIframeHostAllowlistCache(prisma);
      hosts = getIframeHostAllowlistCachedSync();
      vr = validateIframeUrl(String(b.iframeUrl || ""), {
        allowHttp,
        allowedHosts: hosts
      });
    }
    if (!vr.ok) {
      const base = { ok: false, status: 400, message: vr.message, code: vr.code };
      if (vr.code === "IFRAME_URL_NOT_ALLOWED" && vr.host) {
        return { ...base, details: { host: vr.host } };
      }
      return base;
    }
    iframeUrl = vr.url;
  } else if (b.iframeUrl !== undefined && String(b.iframeUrl).trim()) {
    return { ok: false, status: 400, message: "General tasks must not include an iframe URL." };
  }

  const minViewSeconds = clampInt(b.minViewSeconds, 0, 7200, 10);
  const maxExecRaw =
    b.maxExecutionsPerPeriod !== undefined && b.maxExecutionsPerPeriod !== null && String(b.maxExecutionsPerPeriod).trim() !== ""
      ? b.maxExecutionsPerPeriod
      : b.dailyLimitPerUser;
  const dailyLimitPerUser = clampInt(maxExecRaw, 1, 50, 3);
  const sortOrder = clampInt(b.sortOrder, 0, 99999, 0);

  const rewardKind = String(b.rewardKind || "").trim().toUpperCase();
  if (![REWARD_BLK, REWARD_POL, REWARD_HASHRATE_TEMP].includes(rewardKind)) {
    return { ok: false, status: 400, message: "Invalid reward kind (use BLK, POL, or HASHRATE_TEMP)." };
  }

  const data = {
    kind,
    title,
    description,
    iframeUrl,
    minViewSeconds,
    rewardKind,
    dailyLimitPerUser,
    sortOrder,
    isActive: typeof b.isActive === "boolean" ? b.isActive : true,
    completionMode:
      String(b.completionMode || "").trim().toUpperCase() === COMPLETION_ADMIN_APPROVAL
        ? COMPLETION_ADMIN_APPROVAL
        : COMPLETION_USER_SELF_CLAIM
  };

  if (rewardKind === REWARD_BLK) {
    const a = parseFloat(String(b.rewardBlkAmount ?? ""));
    if (!Number.isFinite(a) || a <= 0) {
      return { ok: false, status: 400, message: "BLK reward requires a positive rewardBlkAmount." };
    }
    data.rewardBlkAmount = new Prisma.Decimal(String(a));
  } else if (rewardKind === REWARD_POL) {
    const a = parseFloat(String(b.rewardPolAmount ?? ""));
    if (!Number.isFinite(a) || a <= 0) {
      return { ok: false, status: 400, message: "POL reward requires a positive rewardPolAmount." };
    }
    data.rewardPolAmount = new Prisma.Decimal(String(a));
  } else {
    const hr = parseFloat(String(b.rewardHashRate ?? ""));
    const days = clampInt(b.rewardHashRateDays, 1, 365, 1);
    if (!Number.isFinite(hr) || hr <= 0) {
      return { ok: false, status: 400, message: "HASHRATE_TEMP requires a positive rewardHashRate." };
    }
    data.rewardHashRate = hr;
    data.rewardHashRateDays = days;
  }

  const metaIn = buildTaskMetadataInputForNormalize(b);
  const metaOpts = { allowHttp, allowedHosts: getIframeHostAllowlistCachedSync() };
  let meta = normalizeTaskMetadata(kind, metaIn, metaOpts);
  if (!meta.ok && meta.code === "IFRAME_URL_NOT_ALLOWED" && meta.host) {
    const up = await upsertActiveFrameHost(prisma, meta.host);
    if (!up.ok) {
      return { ok: false, status: 400, message: up.message, code: "IFRAME_HOST_INVALID" };
    }
    await refreshIframeHostAllowlistCache(prisma);
    metaOpts.allowedHosts = getIframeHostAllowlistCachedSync();
    meta = normalizeTaskMetadata(kind, metaIn, metaOpts);
  }
  if (!meta.ok) {
    const base = { ok: false, status: 400, message: meta.message };
    if (meta.code === "IFRAME_URL_NOT_ALLOWED" && meta.host) {
      return { ...base, code: meta.code, details: { host: meta.host } };
    }
    return base;
  }

  const metaVal = meta.value && typeof meta.value === "object" ? { ...meta.value } : null;
  if (metaVal?.resetType === RESET_TYPE_COOLDOWN) {
    if (metaVal.cooldownSeconds == null || !Number.isFinite(Number(metaVal.cooldownSeconds))) {
      return {
        ok: false,
        status: 400,
        message: "COOLDOWN reset requires cooldownSeconds between 60 and 604800."
      };
    }
  } else if (metaVal && metaVal.resetType !== RESET_TYPE_COOLDOWN) {
    delete metaVal.cooldownSeconds;
  }

  data.taskMetadata = metaVal && Object.keys(metaVal).length ? metaVal : null;

  return { ok: true, data };
}

export async function adminListFrameHosts() {
  return prisma.internalOfferwallFrameHost.findMany({
    orderBy: { hostname: "asc" },
    select: { id: true, hostname: true, isActive: true, createdAt: true }
  });
}

/**
 * @param {number} id
 */
export async function adminDeactivateFrameHostById(id) {
  if (!Number.isInteger(id) || id < 1) {
    return { ok: false, status: 400, message: "Invalid frame host id." };
  }
  const row = await prisma.internalOfferwallFrameHost.findUnique({ where: { id } });
  if (!row) {
    return { ok: false, status: 404, message: "Frame host not found." };
  }
  await prisma.internalOfferwallFrameHost.update({
    where: { id },
    data: { isActive: false }
  });
  await refreshIframeHostAllowlistCache(prisma);
  return { ok: true };
}

export async function adminListOffers() {
  return prisma.internalOfferwallOffer.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
  });
}

/**
 * @param {object} data
 */
export async function adminCreateOffer(data) {
  return prisma.internalOfferwallOffer.create({ data });
}

/**
 * @param {number} id
 * @param {object} patch
 */
export async function adminPatchOffer(id, patch) {
  return prisma.internalOfferwallOffer.update({
    where: { id },
    data: patch
  });
}

export async function adminListAttempts({ status, offerId, limit }) {
  const where = {};
  if (status) where.status = String(status);
  if (offerId) where.offerId = offerId;
  return prisma.internalOfferwallAttempt.findMany({
    where,
    orderBy: { submittedAt: "desc" },
    take: Math.min(200, Math.max(1, limit || 50)),
    include: {
      offer: { select: { id: true, title: true, kind: true } },
      user: { select: { id: true, email: true, username: true } }
    }
  });
}

/**
 * Removes STARTED attempts that were left open for too long so users get a clean "Start" again.
 * @param {number} userId
 * @param {string} periodKey
 */
async function abandonStaleStartedAttempts(userId, periodKey) {
  const raw = String(process.env.INTERNAL_OFFERWALL_ABANDON_STARTED_AFTER_SEC || "").trim();
  const parsed = raw ? parseInt(raw, 10) : 86400;
  const sec = Number.isFinite(parsed) && parsed >= 300 ? parsed : 86400;
  const cutoff = new Date(Date.now() - sec * 1000);
  await prisma.internalOfferwallAttempt.deleteMany({
    where: {
      userId,
      periodKey,
      status: ATTEMPT_STATUS_STARTED,
      startedAt: { lt: cutoff }
    }
  });
}

/**
 * @param {object} row
 * @param {ReturnType<typeof computeUsageSnapshot>} usageSnap
 */
function publicOfferShape(row, usageSnap) {
  const meta = row.taskMetadata && typeof row.taskMetadata === "object" ? row.taskMetadata : null;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    iframeUrl: row.kind === OFFER_KIND_PTC_IFRAME ? row.iframeUrl : null,
    minViewSeconds: row.minViewSeconds,
    rewardKind: row.rewardKind,
    rewardBlkAmount: row.rewardBlkAmount?.toString?.() ?? null,
    rewardPolAmount: row.rewardPolAmount?.toString?.() ?? null,
    rewardHashRate: row.rewardHashRate,
    rewardHashRateDays: row.rewardHashRateDays,
    completionMode: row.completionMode,
    sortOrder: row.sortOrder,
    taskMetadata: meta,
    dailyLimitPerUser: row.dailyLimitPerUser,
    maxExecutionsPerPeriod: row.dailyLimitPerUser,
    resetType: usageSnap.resetType,
    cooldownSeconds: usageSnap.cooldownWindowSec,
    usage: {
      completedCount: usageSnap.completedCount,
      maxPerPeriod: usageSnap.maxPerPeriod,
      secondsUntilAvailable: usageSnap.secondsUntilAvailable,
      canStartNew: usageSnap.canStartNew
    }
  };
}

export async function userListOffers(userId) {
  if (!isInternalOfferwallEnabled()) {
    return { ok: false, code: "FEATURE_DISABLED", offers: [], openAttempts: [] };
  }
  const now = new Date();
  const periodKey = getDailyTaskPeriodKey(now);
  await abandonStaleStartedAttempts(userId, periodKey);
  const offers = await prisma.internalOfferwallOffer.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
  });
  const openRows = await prisma.internalOfferwallAttempt.findMany({
    where: {
      userId,
      periodKey,
      status: { in: [ATTEMPT_STATUS_STARTED, ATTEMPT_STATUS_PENDING_REVIEW] },
      offer: { isActive: true }
    },
    include: { offer: true }
  });
  const offerIds = offers.map((o) => o.id);
  const since = new Date(now.getTime() - COMPLETION_HISTORY_LOOKBACK_MS);
  /** @type {Map<number, { periodKey: string, completedAt: Date | null }[]>} */
  const completionByOffer = new Map();
  if (offerIds.length) {
    const compRows = await prisma.internalOfferwallAttempt.findMany({
      where: {
        userId,
        offerId: { in: offerIds },
        status: ATTEMPT_STATUS_COMPLETED,
        completedAt: { not: null, gte: since }
      },
      select: { offerId: true, periodKey: true, completedAt: true }
    });
    for (const r of compRows) {
      const list = completionByOffer.get(r.offerId) || [];
      list.push({ periodKey: r.periodKey, completedAt: r.completedAt });
      completionByOffer.set(r.offerId, list);
    }
  }
  const hasOpenByOffer = new Map();
  for (const o of openRows) {
    hasOpenByOffer.set(o.offerId, true);
  }

  const openAttempts = openRows.map((open) => {
    const cfg = getOfferLimitConfig(open.offer);
    const rows = completionByOffer.get(open.offerId) || [];
    const usageSnap = computeUsageSnapshot({
      resetType: cfg.resetType,
      maxPerPeriod: cfg.maxPerPeriod,
      cooldownWindowSec: cfg.cooldownWindowSec,
      completionRows: rows,
      periodKey,
      now,
      hasOpenAttempt: true
    });
    return {
      id: open.id,
      offerId: open.offerId,
      status: open.status,
      startedAt: open.startedAt.toISOString(),
      partnerOpenedAt: open.partnerOpenedAt ? open.partnerOpenedAt.toISOString() : null,
      offer: publicOfferShape(open.offer, usageSnap)
    };
  });
  return {
    ok: true,
    offers: offers.map((row) => {
      const cfg = getOfferLimitConfig(row);
      const rows = completionByOffer.get(row.id) || [];
      const usageSnap = computeUsageSnapshot({
        resetType: cfg.resetType,
        maxPerPeriod: cfg.maxPerPeriod,
        cooldownWindowSec: cfg.cooldownWindowSec,
        completionRows: rows,
        periodKey,
        now,
        hasOpenAttempt: Boolean(hasOpenByOffer.get(row.id))
      });
      return publicOfferShape(row, usageSnap);
    }),
    openAttempts
  };
}

/**
 * @param {number} userId
 * @param {number} offerId
 */
/**
 * @param {number} userId
 * @param {number} offerId
 */
async function userStartOfferOnceSerializable(userId, offerId) {
  const now = new Date();
  const periodKey = getDailyTaskPeriodKey(now);
  const since = new Date(now.getTime() - COMPLETION_HISTORY_LOOKBACK_MS);

  return prisma.$transaction(
    async (tx) => {
      await advisoryXactTryLockOrThrow(tx, `internal_offerwall:${userId}`);
      const offer = await tx.internalOfferwallOffer.findFirst({
        where: { id: offerId, isActive: true }
      });
      if (!offer) {
        return {
          ok: false,
          status: 404,
          code: "TASK_NOT_AVAILABLE",
          message: "Offer not found or inactive.",
          messageKey: "internalOfferwallPage.errors.task_not_available"
        };
      }

      const cfg = getOfferLimitConfig(offer);
      const completionRows = await tx.internalOfferwallAttempt.findMany({
        where: {
          userId,
          offerId,
          status: ATTEMPT_STATUS_COMPLETED,
          completedAt: { not: null, gte: since }
        },
        select: { periodKey: true, completedAt: true }
      });

      const existing = await tx.internalOfferwallAttempt.findFirst({
        where: {
          userId,
          offerId,
          periodKey,
          status: { in: [ATTEMPT_STATUS_STARTED, ATTEMPT_STATUS_PENDING_REVIEW] }
        }
      });
      const hasOpen = Boolean(existing);

      const snap = computeUsageSnapshot({
        resetType: cfg.resetType,
        maxPerPeriod: cfg.maxPerPeriod,
        cooldownWindowSec: cfg.cooldownWindowSec,
        completionRows,
        periodKey,
        now,
        hasOpenAttempt: hasOpen
      });

      if (!snap.canStartNew && !hasOpen) {
        return {
          ok: false,
          status: 429,
          code: "TASK_LIMIT_REACHED",
          message: "Execution limit reached for this offer.",
          messageKey: "internalOfferwallPage.errors.task_limit_reached",
          secondsUntilReset: snap.secondsUntilAvailable ?? 0
        };
      }

      if (existing) {
        return {
          ok: true,
          attempt: {
            id: existing.id,
            offerId: existing.offerId,
            status: existing.status,
            startedAt: existing.startedAt.toISOString(),
            partnerOpenedAt: existing.partnerOpenedAt ? existing.partnerOpenedAt.toISOString() : null
          }
        };
      }

      const attempt = await tx.internalOfferwallAttempt.create({
        data: {
          userId,
          offerId,
          periodKey,
          status: ATTEMPT_STATUS_STARTED,
          startedAt: now
        }
      });
      return {
        ok: true,
        attempt: {
          id: attempt.id,
          offerId: attempt.offerId,
          status: attempt.status,
          startedAt: attempt.startedAt.toISOString(),
          partnerOpenedAt: attempt.partnerOpenedAt ? attempt.partnerOpenedAt.toISOString() : null
        }
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 12_000
    }
  );
}

export async function userStartOffer(userId, offerId) {
  if (!isInternalOfferwallEnabled()) {
    return {
      ok: false,
      status: 403,
      code: "TASK_NOT_AVAILABLE",
      message: "This feature is disabled.",
      messageKey: "internalOfferwallPage.errors.task_not_available"
    };
  }

  const maxTries = 4;
  for (let i = 0; i < maxTries; i++) {
    try {
      return await userStartOfferOnceSerializable(userId, offerId);
    } catch (e) {
      if (isPrismaSerializationConflict(e) && i < maxTries - 1) {
        continue;
      }
      throw e;
    }
  }
  return {
    ok: false,
    status: 503,
    code: "TASK_NOT_AVAILABLE",
    message: "Could not start the task. Try again.",
    messageKey: "internalOfferwallPage.errors.task_start_conflict"
  };
}

/**
 * Records that the user opened the partner page (PTC only). Each call resets the min-view clock.
 *
 * @param {number} userId
 * @param {number} attemptId
 */
export async function userMarkPartnerOpened(userId, attemptId) {
  if (!isInternalOfferwallEnabled()) {
    return { ok: false, status: 403, code: "FEATURE_DISABLED", message: "This feature is disabled." };
  }
  const attempt = await prisma.internalOfferwallAttempt.findFirst({
    where: { id: attemptId, userId },
    include: { offer: true }
  });
  if (!attempt || !attempt.offer?.isActive) {
    return { ok: false, status: 404, code: "ATTEMPT_NOT_FOUND", message: "Attempt not found." };
  }
  if (attempt.status !== ATTEMPT_STATUS_STARTED) {
    return { ok: false, status: 400, code: "INVALID_STATE", message: "This attempt cannot be updated now." };
  }
  if (String(attempt.offer.kind).toUpperCase() !== OFFER_KIND_PTC_IFRAME) {
    return { ok: false, status: 400, code: "NOT_PTC_OFFER", message: "Partner open tracking applies only to paid-view offers." };
  }
  if (!String(attempt.offer.iframeUrl || "").trim()) {
    return { ok: false, status: 400, code: "NO_PARTNER_URL", message: "This offer has no partner URL configured." };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await advisoryXactTryLockOrThrow(tx, `internal_offerwall:${userId}`);
    await tx.internalOfferwallAttempt.update({
      where: { id: attemptId },
      data: { partnerOpenedAt: now },
    });
  });
  return {
    ok: true,
    partnerOpenedAt: now.toISOString()
  };
}

/**
 * User-initiated exit: removes a STARTED attempt so the offer can be started again (same pattern as abandonStaleStartedAttempts).
 * Does not remove PENDING_REVIEW (submitted for admin review).
 *
 * @param {number} userId
 * @param {number} attemptId
 */
export async function userAbandonAttempt(userId, attemptId) {
  if (!isInternalOfferwallEnabled()) {
    return { ok: false, status: 403, code: "FEATURE_DISABLED", message: "This feature is disabled." };
  }
  if (!Number.isInteger(attemptId) || attemptId < 1) {
    return { ok: false, status: 400, code: "INVALID_ATTEMPT", message: "Invalid attempt id." };
  }

  const attempt = await prisma.internalOfferwallAttempt.findFirst({
    where: { id: attemptId, userId },
    select: { id: true, status: true }
  });
  if (!attempt) {
    return { ok: false, status: 404, code: "ATTEMPT_NOT_FOUND", message: "Attempt not found." };
  }
  if (attempt.status === ATTEMPT_STATUS_PENDING_REVIEW) {
    return {
      ok: false,
      status: 400,
      code: "CANNOT_ABANDON_PENDING_REVIEW",
      message: "This submission is waiting for review and cannot be cancelled from here."
    };
  }
  if (attempt.status !== ATTEMPT_STATUS_STARTED) {
    return { ok: true, alreadyCleared: true };
  }

  const del = await prisma.internalOfferwallAttempt.deleteMany({
    where: { id: attemptId, userId, status: ATTEMPT_STATUS_STARTED }
  });
  return { ok: true, deleted: del.count > 0 };
}

/**
 * @param {number} userId
 * @param {number} attemptId
 */
export async function userSubmitAttempt(userId, attemptId) {
  if (!isInternalOfferwallEnabled()) {
    return { ok: false, status: 403, code: "FEATURE_DISABLED", message: "This feature is disabled." };
  }
  const attempt = await prisma.internalOfferwallAttempt.findFirst({
    where: { id: attemptId, userId },
    include: { offer: true }
  });
  if (!attempt || !attempt.offer?.isActive) {
    return { ok: false, status: 404, code: "ATTEMPT_NOT_FOUND", message: "Attempt not found." };
  }
  if (attempt.status !== ATTEMPT_STATUS_STARTED) {
    return { ok: false, status: 400, code: "INVALID_STATE", message: "This attempt cannot be submitted now." };
  }

  const now = new Date();
  const minView = assertMinViewForSubmit({
    offerKind: attempt.offer.kind,
    startedAt: attempt.startedAt,
    partnerOpenedAt: attempt.partnerOpenedAt,
    now,
    minViewSeconds: attempt.offer.minViewSeconds
  });
  if (!minView.ok) {
    if (minView.code === "PARTNER_NOT_OPENED") {
      return {
        ok: false,
        status: 400,
        code: "PARTNER_NOT_OPENED",
        message: "Open the partner page using the button, wait on this tab, then submit."
      };
    }
    return {
      ok: false,
      status: 400,
      code: "MIN_VIEW_NOT_MET",
      message: "Keep the task open for the required time before submitting."
    };
  }

  if (attempt.offer.completionMode === COMPLETION_ADMIN_APPROVAL) {
    const snap = await buildUserAuditSnapshotJson(userId);
    await prisma.internalOfferwallAttempt.update({
      where: { id: attempt.id },
      data: {
        status: ATTEMPT_STATUS_PENDING_REVIEW,
        submittedAt: now,
        auditSnapshot: snap
      }
    });
    return {
      ok: true,
      status: "PENDING_REVIEW",
      message: "Submitted for review. You will receive the reward after approval."
    };
  }

  // Self-claim: grant + complete in one transaction
  const snap = await buildUserAuditSnapshotJson(userId);
  try {
    await prisma.$transaction(async (tx) => {
      await advisoryXactTryLockOrThrow(tx, `internal_offerwall:${userId}`);
      const fresh = await tx.internalOfferwallAttempt.findFirst({
        where: { id: attemptId, userId, status: ATTEMPT_STATUS_STARTED }
      });
      if (!fresh) throw new Error("CONFLICT");

      await grantInternalOfferwallRewardInTx(tx, {
        userId,
        rewardKind: attempt.offer.rewardKind,
        rewardBlkAmount: attempt.offer.rewardBlkAmount,
        rewardPolAmount: attempt.offer.rewardPolAmount,
        rewardHashRate: attempt.offer.rewardHashRate,
        rewardHashRateDays: attempt.offer.rewardHashRateDays
      });

      await tx.internalOfferwallAttempt.update({
        where: { id: attemptId },
        data: {
          status: ATTEMPT_STATUS_COMPLETED,
          submittedAt: now,
          completedAt: now,
          rewardGrantedAt: now,
          auditSnapshot: snap
        }
      });
    });
  } catch (e) {
    if (String(e.message) === "CONFLICT") {
      return { ok: false, status: 409, code: "CONFLICT", message: "Attempt was already updated." };
    }
    const msg = String(e.message || "");
    if (
      msg === "REWARD_BLK_INVALID" ||
      msg === "REWARD_POL_INVALID" ||
      msg === "REWARD_HASHRATE_INVALID" ||
      msg === "REWARD_KIND_UNSUPPORTED"
    ) {
      return {
        ok: false,
        status: 400,
        code: "REWARD_CONFIG_INVALID",
        message: "This offer has an invalid reward configuration."
      };
    }
    throw e;
  }

  try {
    await bumpDailyTasksForUser(userId, TASK_INTERNAL_OFFERWALL, {
      dedupeKey: `iof-complete:${attemptId}`,
      delta: 1,
      internalOfferwallOfferId: attempt.offerId
    });
  } catch (bumpErr) {
    console.error("internalOfferwall userSubmitAttempt: bumpDailyTasksForUser failed after grant", {
      userId,
      attemptId,
      offerId: attempt.offerId,
      message: bumpErr?.message
    });
  }

  const { syncUserBaseHashRate } = await import("../../models/minerProfileModel.js");
  const { getMiningEngine } = await import("../../src/miningEngineInstance.js");
  if (String(attempt.offer.rewardKind).toUpperCase() === REWARD_HASHRATE_TEMP) {
    await syncUserBaseHashRate(userId);
    getMiningEngine()?.reloadMinerProfile(userId).catch(() => {});
  }

  notifyInternalOfferwallCompletion({
    event: "INTERNAL_OFFERWALL_SELF_CLAIM_COMPLETED",
    attemptId: attempt.id,
    userId,
    offerId: attempt.offerId,
    offerKind: attempt.offer.kind,
    completedAtIso: now.toISOString()
  });

  return {
    ok: true,
    status: "COMPLETED",
    message: "Reward granted."
  };
}

/**
 * @param {number} attemptId
 */
export async function adminApproveAttempt(attemptId) {
  const attempt = await prisma.internalOfferwallAttempt.findFirst({
    where: { id: attemptId, status: ATTEMPT_STATUS_PENDING_REVIEW },
    include: { offer: true }
  });
  if (!attempt || !attempt.offer) {
    return { ok: false, status: 404, message: "Pending attempt not found." };
  }
  if (!attempt.offer.isActive) {
    return { ok: false, status: 400, message: "Offer is inactive." };
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await advisoryXactTryLockOrThrow(tx, `internal_offerwall:${attempt.userId}`);
    const row = await tx.internalOfferwallAttempt.findFirst({
      where: { id: attemptId, status: ATTEMPT_STATUS_PENDING_REVIEW }
    });
    if (!row) throw new Error("gone");

    await grantInternalOfferwallRewardInTx(tx, {
      userId: attempt.userId,
      rewardKind: attempt.offer.rewardKind,
      rewardBlkAmount: attempt.offer.rewardBlkAmount,
      rewardPolAmount: attempt.offer.rewardPolAmount,
      rewardHashRate: attempt.offer.rewardHashRate,
      rewardHashRateDays: attempt.offer.rewardHashRateDays
    });

    await tx.internalOfferwallAttempt.update({
      where: { id: attemptId },
      data: {
        status: ATTEMPT_STATUS_COMPLETED,
        completedAt: now,
        rewardGrantedAt: now
      }
    });
  });

  try {
    await bumpDailyTasksForUser(attempt.userId, TASK_INTERNAL_OFFERWALL, {
      dedupeKey: `iof-complete:${attemptId}`,
      delta: 1,
      internalOfferwallOfferId: attempt.offerId
    });
  } catch (bumpErr) {
    console.error("internalOfferwall adminApproveAttempt: bumpDailyTasksForUser failed after grant", {
      userId: attempt.userId,
      attemptId,
      offerId: attempt.offerId,
      message: bumpErr?.message
    });
  }

  const { syncUserBaseHashRate } = await import("../../models/minerProfileModel.js");
  const { getMiningEngine } = await import("../../src/miningEngineInstance.js");
  if (String(attempt.offer.rewardKind).toUpperCase() === REWARD_HASHRATE_TEMP) {
    await syncUserBaseHashRate(attempt.userId);
    getMiningEngine()?.reloadMinerProfile(attempt.userId).catch(() => {});
  }

  notifyInternalOfferwallCompletion({
    event: "INTERNAL_OFFERWALL_ADMIN_APPROVED",
    attemptId: attempt.id,
    userId: attempt.userId,
    offerId: attempt.offerId,
    offerKind: attempt.offer.kind,
    completedAtIso: now.toISOString()
  });

  return { ok: true };
}

/**
 * @param {number} attemptId
 * @param {string} [note]
 */
export async function adminRejectAttempt(attemptId, note) {
  const attempt = await prisma.internalOfferwallAttempt.findFirst({
    where: { id: attemptId, status: ATTEMPT_STATUS_PENDING_REVIEW }
  });
  if (!attempt) {
    return { ok: false, status: 404, message: "Pending attempt not found." };
  }
  await prisma.internalOfferwallAttempt.update({
    where: { id: attemptId },
    data: {
      status: ATTEMPT_STATUS_REJECTED,
      completedAt: new Date(),
      adminNote: note ? String(note).slice(0, 2000) : null
    }
  });
  return { ok: true };
}
