import type { Request, Response } from "express";
import loggerLib from "../../utils/logger.js";
import { syncUserBaseHashRate } from "../../models/minerProfileModel.js";
import { getMiningEngine } from "../../src/miningEngineInstance.js";
import { notifyMiniPassAutoMiningTurbo } from "../../services/miniPass/miniPassMissionHookService.js";
import {
  startSession,
  stopSession,
  getStatusPayload,
  claimNormal,
  getOrCreateBannerImpression,
  registerBannerClick,
  claimTurbo,
} from "./auto-mining.v2.service.js";

const logger = loggerLib.child("AutoMiningV2Controller");

type AuthedRequest = Request & { user: { id: number } };
type ServiceError = Error & { code?: string };

function userId(req: Request): number {
  return (req as AuthedRequest).user.id;
}

function sendError(res: Response, err: unknown, defaultStatus = 400) {
  const e = err as ServiceError;
  const code = e.code || "SERVER_ERROR";
  const status =
    code === "SCHEMA_UNAVAILABLE" ? 503
    : code === "NOT_FOUND"        ? 404
    : code === "CONCURRENT_CLAIM" ? 409
    : code === "INVALID_MODE"     ? 400
    : defaultStatus;
  res.status(status).json({ success: false, error: e.message || "Request failed", code });
}

async function syncEngineForUser(uid: number) {
  try {
    const newTotal = await syncUserBaseHashRate(uid);
    const engine = getMiningEngine();
    if (engine) {
      const miner = engine.findMinerByUserId(uid);
      if (miner) miner.baseHashRate = newTotal;
      if (engine.io) engine.io.to(`user:${uid}`).emit("machines:update");
    }
  } catch (e: unknown) {
    logger.warn("syncEngineForUser failed", { userId: uid, message: e instanceof Error ? e.message : String(e) });
  }
}

/** POST /v2/session/start */
export async function postStartSession(req: Request, res: Response) {
  try {
    const mode = String((req.body as { mode?: string })?.mode || "").toUpperCase();
    const uid = userId(req);
    logger.info("postStartSession_entered", { userId: uid, mode });
    await startSession(uid, mode);
    const payload = await getStatusPayload(uid);
    res.json({ success: true, ...payload });
  } catch (err: unknown) {
    logger.error("postStartSession", { message: err instanceof Error ? err.message : String(err) });
    sendError(res, err);
  }
}

/** POST /v2/session/stop */
export async function postStopSession(req: Request, res: Response) {
  try {
    const uid = userId(req);
    await stopSession(uid);
    const payload = await getStatusPayload(uid);
    res.json({ success: true, ...payload });
  } catch (err: unknown) {
    logger.error("postStopSession", { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: "Server error", code: "SERVER_ERROR" });
  }
}

/** GET /v2/status */
export async function getV2Status(req: Request, res: Response) {
  try {
    const payload = await getStatusPayload(userId(req));
    res.json({ success: true, ...payload });
  } catch (err: unknown) {
    logger.error("getV2Status", { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: "Server error", code: "SERVER_ERROR" });
  }
}

/** POST /v2/claim/normal */
export async function postClaimNormal(req: Request, res: Response) {
  try {
    const uid = userId(req);
    const result = await claimNormal(uid);
    await syncEngineForUser(uid);
    const payload = await getStatusPayload(uid);
    res.json({
      success: true,
      grant: {
        id: result.grant.id,
        hashRate: result.grant.hashRate,
        earnedAt: result.grant.earnedAt.toISOString(),
        expiresAt: result.grant.expiresAt.toISOString(),
        mode: result.grant.mode,
      },
      nextClaimAt: result.nextClaimAt.toISOString(),
      ...payload,
    });
  } catch (err: unknown) {
    sendError(res, err);
  }
}

/** GET /v2/banner */
export async function getTurboBanner(req: Request, res: Response) {
  try {
    const { impression, reused } = await getOrCreateBannerImpression(userId(req));
    res.json({
      success: true,
      reused,
      impression: {
        id: impression.id,
        bannerKey: impression.bannerKey,
        targetUrl: impression.targetUrl,
        title: impression.title,
        imageUrl: impression.imageUrl,
        createdAt: impression.createdAt.toISOString(),
      },
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
      return res.status(400).json({ success: false, error: "impressionId is required", code: "VALIDATION" });
    }
    const row = await registerBannerClick(userId(req), impressionId);
    res.json({ success: true, clickedAt: row.clickedAt?.toISOString() || null });
  } catch (err: unknown) {
    sendError(res, err);
  }
}

/** POST /v2/claim/turbo */
export async function postClaimTurbo(req: Request, res: Response) {
  try {
    const impressionId = String((req.body as { impressionId?: string })?.impressionId || "");
    if (!impressionId) {
      return res.status(400).json({ success: false, error: "impressionId is required", code: "VALIDATION" });
    }
    const uid = userId(req);
    const result = await claimTurbo(uid, impressionId);
    await notifyMiniPassAutoMiningTurbo(uid, result.grant?.id);
    await syncEngineForUser(uid);
    const payload = await getStatusPayload(uid);
    res.json({
      success: true,
      grant: {
        id: result.grant.id,
        hashRate: result.grant.hashRate,
        earnedAt: result.grant.earnedAt.toISOString(),
        expiresAt: result.grant.expiresAt.toISOString(),
        mode: result.grant.mode,
      },
      nextClaimAt: result.nextClaimAt.toISOString(),
      ...payload,
    });
  } catch (err: unknown) {
    sendError(res, err);
  }
}
