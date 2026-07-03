import type { Request, Response } from "express";
import loggerLib from "../../utils/logger.js";
import { syncUserBaseHashRate } from "../../models/minerProfileModel.js";
import { getMiningEngine } from "../../src/miningEngineInstance.js";
import * as service from "./auto-mining.service.js";

const logger = loggerLib.child("AutoMiningController");

type AuthedRequest = Request & { user: { id: number } };

function userId(req: Request): number {
  return (req as AuthedRequest).user.id;
}

async function syncEngine(uid: number) {
  try {
    const newTotal = await syncUserBaseHashRate(uid);
    const engine = getMiningEngine();
    if (engine) {
      const miner = engine.findMinerByUserId(uid);
      if (miner) miner.baseHashRate = newTotal;
      if (engine.io) engine.io.to(`user:${uid}`).emit("machines:update");
    }
  } catch (e: unknown) {
    logger.warn("syncEngine failed", { userId: uid, message: e instanceof Error ? e.message : String(e) });
  }
}

export async function getAvailableGPUsHandler(req: Request, res: Response) {
  try {
    const gpus = await service.getAvailableGPUs(userId(req));
    res.json({ success: true, data: gpus, count: gpus.length });
  } catch (err: unknown) {
    logger.error("getAvailableGPUs failed", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function claimGPUHandler(req: Request, res: Response) {
  try {
    const { gpu_id } = req.body as { gpu_id?: unknown };
    if (!gpu_id) return res.status(400).json({ success: false, error: "GPU ID is required" });

    const uid = userId(req);
    const { gpu } = await service.claimGPU(uid, Number(gpu_id));
    await syncEngine(uid);
    res.json({ success: true, message: "GPU claimed successfully", data: gpu });
  } catch (err: unknown) {
    const e = err as Error & { code?: string };
    if (e.code === "GPU_NOT_FOUND") return res.status(404).json({ success: false, error: e.message });
    if (e.code === "DAILY_LIMIT_REACHED") return res.status(400).json({ success: false, error: e.message });
    if (e.code === "INSUFFICIENT_SECONDS") return res.status(400).json({ success: false, error: e.message });
    logger.error("claimGPU failed", { error: e.message });
    res.status(400).json({ success: false, error: "Unable to claim GPU" });
  }
}

export async function getGPUHistoryHandler(req: Request, res: Response) {
  try {
    const history = await service.getGPUHistory(userId(req));
    res.json({ success: true, data: history });
  } catch {
    res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function getActiveRewardHandler(req: Request, res: Response) {
  try {
    const { reward, stats } = await service.getActiveRewardWithStats(userId(req));
    res.json({ success: true, data: reward, stats });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("getActiveReward failed", { error: msg, stack: err instanceof Error ? err.stack : undefined });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}
