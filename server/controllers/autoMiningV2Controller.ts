/**
 * HTTP handlers for Auto Mining GPU v2 (session, claims, turbo banner).
 */

import type { Request, Response } from "express";
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
import { notifyMiniPassAutoMiningTurbo } from "../services/miniPass/miniPassMissionHookService.js";

const logger = loggerLib.child("AutoMiningV2Controller");

type AuthedRequest = Request & { user: { id: number } };

type ServiceError = Error & { code?: string };

function sendError(res: Response, err: unknown, defaultStatus = 400) {
  const e = err as ServiceError;
  const code = e.code || "SERVER_ERROR";
  const status =
    code === "SCHEMA_UNAVAILABLE"
      ? 503
      : code === "NOT_FOUND"
        ? 404
        : code === "CONCURRENT_CLAIM"
          ? 409
          : code === "INVALID_MODE"
            ? 400
            : defaultStatus;
  const message = e.message || "Request failed";
  res.status(status).json({ success: false, error: message, code });
}

async function syncEngineForUser(userId: number) {
  try {
    const newTotal = await syncUserBaseHashRate(userId);
    const engine = getMiningEngine();
    if (engine) {
      const miner = engine.findMinerByUserId(userId);
      if (miner) miner.baseHashRate = newTotal;
      if (engine.io) engine.io.to(`user:${userId}`).emit("machines:update");
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn("syncEngineForUser failed", { userId, message: msg });
  }
}

/** POST /v2/session/start */
export async function postStartSession(req: Request, res: Response) {
  try {
    const mode = String((req.body as { mode?: string })?.mode || "").toUpperCase();
    const userId = (req as AuthedRequest).user.id;
    logger.info("postStartSession_entered", { userId, mode });
    await startSession(userId, mode);
    const payload = await getStatusPayload((req as AuthedRequest).user.id);
    res.json({ success: true, ...payload });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("postStartSession", { message: msg });
    sendError(res, err);
  }
}

/** POST /v2/session/stop */
export async function postStopSession(req: Request, res: Response) {
  try {
    await stopSession((req as AuthedRequest).user.id);
    const payload = await getStatusPayload((req as AuthedRequest).user.id);
    res.json({ success: true, ...payload });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("postStopSession", { message: msg });
    res.status(500).json({ success: false, error: "Server error", code: "SERVER_ERROR" });
  }
}

/** GET /v2/status */
export async function getV2Status(req: Request, res: Response) {
  try {
    const payload = await getStatusPayload((req as AuthedRequest).user.id);
    res.json({ success: true, ...payload });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("getV2Status", { message: msg });
    res.status(500).json({ success: false, error: "Server error", code: "SERVER_ERROR" });
  }
}

/** POST /v2/claim/normal */
export async function postClaimNormal(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).user.id;
    const result = await claimNormal(userId);
    await syncEngineForUser(userId);
    const payload = await getStatusPayload(userId);
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
  } catch (err: unknown) {
    sendError(res, err);
  }
}

/** GET /v2/banner */
export async function getTurboBanner(req: Request, res: Response) {
  try {
    const { impression, reused } = await getOrCreateBannerImpression((req as AuthedRequest).user.id);
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
  } catch (err: unknown) {
    sendError(res, err);
  }
}

/** POST /v2/banner/click */
export async function postBannerClick(req: Request, res: Response) {
  try {
    const impressionId = String((req.body as { impressionId?: string })?.impressionId || "");
    if (!impressionId) {
      return res.status(400).json({
        success: false,
        error: "impressionId is required",
        code: "VALIDATION"
      });
    }
    const row = await registerBannerClick((req as AuthedRequest).user.id, impressionId);
    res.json({
      success: true,
      clickedAt: row.clickedAt?.toISOString() || null
    });
  } catch (err: unknown) {
    sendError(res, err);
  }
}

/** POST /v2/claim/turbo */
export async function postClaimTurbo(req: Request, res: Response) {
  try {
    const impressionId = String((req.body as { impressionId?: string })?.impressionId || "");
    if (!impressionId) {
      return res.status(400).json({
        success: false,
        error: "impressionId is required",
        code: "VALIDATION"
      });
    }
    const userId = (req as AuthedRequest).user.id;
    const result = await claimTurbo(userId, impressionId);
    await notifyMiniPassAutoMiningTurbo(userId, result.grant?.id);
    await syncEngineForUser(userId);
    const payload = await getStatusPayload(userId);
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
  } catch (err: unknown) {
    sendError(res, err);
  }
}
