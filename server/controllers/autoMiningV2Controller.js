/**
 * HTTP handlers for Auto Mining GPU v2 (session, claims, turbo banner).
 */

import loggerLib from "../utils/logger.js";
import { syncUserBaseHashRate } from "../models/minerProfileModel.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import {
  startSession,
  stopSession,
  getStatusPayload,
  claimNormal,
  getOrCreateBannerImpression,
  registerBannerClick,
  claimTurbo
} from "../services/autoMiningV2/autoMiningV2Service.js";

const logger = loggerLib.child("AutoMiningV2Controller");

/**
 * Pushes recalculated base hashrate to the mining engine for the user.
 * @param {number} userId
 */
async function syncEngineForUser(userId) {
  try {
    const newTotal = await syncUserBaseHashRate(userId);
    const engine = getMiningEngine();
    if (engine) {
      const miner = engine.findMinerByUserId(userId);
      if (miner) miner.baseHashRate = newTotal;
      if (engine.io) engine.io.to(`user:${userId}`).emit("machines:update");
    }
  } catch (e) {
    logger.warn("syncEngineForUser failed", { userId, message: e?.message });
  }
}

/**
 * @param {import('express').Response} res
 * @param {Error & { code?: string }} err
 */
function sendError(res, err, defaultStatus = 400) {
  const code = err.code || "SERVER_ERROR";
  const status =
    code === "NOT_FOUND"
      ? 404
      : code === "CONCURRENT_CLAIM"
        ? 409
        : code === "INVALID_MODE"
          ? 400
          : defaultStatus;
  const message = err.message || "Request failed";
  res.status(status).json({ success: false, error: message, code });
}

/** POST /v2/session/start */
export async function postStartSession(req, res) {
  try {
    const mode = String(req.body?.mode || "").toUpperCase();
    await startSession(req.user.id, mode);
    const payload = await getStatusPayload(req.user.id);
    res.json({ success: true, ...payload });
  } catch (err) {
    logger.error("postStartSession", { message: err?.message });
    sendError(res, err);
  }
}

/** POST /v2/session/stop */
export async function postStopSession(req, res) {
  try {
    await stopSession(req.user.id);
    const payload = await getStatusPayload(req.user.id);
    res.json({ success: true, ...payload });
  } catch (err) {
    logger.error("postStopSession", { message: err?.message });
    res.status(500).json({ success: false, error: "Server error", code: "SERVER_ERROR" });
  }
}

/** GET /v2/status */
export async function getV2Status(req, res) {
  try {
    const payload = await getStatusPayload(req.user.id);
    res.json({ success: true, ...payload });
  } catch (err) {
    logger.error("getV2Status", { message: err?.message });
    res.status(500).json({ success: false, error: "Server error", code: "SERVER_ERROR" });
  }
}

/** POST /v2/claim/normal */
export async function postClaimNormal(req, res) {
  try {
    const result = await claimNormal(req.user.id);
    await syncEngineForUser(req.user.id);
    const payload = await getStatusPayload(req.user.id);
    res.json({
      success: true,
      grant: {
        id: result.grant.id,
        hashRate: result.grant.hashRate,
        earnedAt: result.grant.earnedAt.toISOString(),
        expiresAt: result.grant.expiresAt.toISOString(),
        mode: result.grant.mode
      },
      nextClaimAt: result.nextClaimAt.toISOString(),
      ...payload
    });
  } catch (err) {
    sendError(res, err);
  }
}

/** GET /v2/banner */
export async function getTurboBanner(req, res) {
  try {
    const { impression, reused } = await getOrCreateBannerImpression(req.user.id);
    res.json({
      success: true,
      reused,
      impression: {
        id: impression.id,
        bannerKey: impression.bannerKey,
        targetUrl: impression.targetUrl,
        title: impression.title,
        imageUrl: impression.imageUrl,
        createdAt: impression.createdAt.toISOString()
      }
    });
  } catch (err) {
    sendError(res, err);
  }
}

/** POST /v2/banner/click */
export async function postBannerClick(req, res) {
  try {
    const impressionId = String(req.body?.impressionId || "");
    if (!impressionId) {
      return res.status(400).json({
        success: false,
        error: "impressionId is required",
        code: "VALIDATION"
      });
    }
    const row = await registerBannerClick(req.user.id, impressionId);
    res.json({
      success: true,
      clickedAt: row.clickedAt?.toISOString() || null
    });
  } catch (err) {
    sendError(res, err);
  }
}

/** POST /v2/claim/turbo */
export async function postClaimTurbo(req, res) {
  try {
    const impressionId = String(req.body?.impressionId || "");
    if (!impressionId) {
      return res.status(400).json({
        success: false,
        error: "impressionId is required",
        code: "VALIDATION"
      });
    }
    const result = await claimTurbo(req.user.id, impressionId);
    await syncEngineForUser(req.user.id);
    const payload = await getStatusPayload(req.user.id);
    res.json({
      success: true,
      grant: {
        id: result.grant.id,
        hashRate: result.grant.hashRate,
        earnedAt: result.grant.earnedAt.toISOString(),
        expiresAt: result.grant.expiresAt.toISOString(),
        mode: result.grant.mode
      },
      nextClaimAt: result.nextClaimAt.toISOString(),
      ...payload
    });
  } catch (err) {
    sendError(res, err);
  }
}
