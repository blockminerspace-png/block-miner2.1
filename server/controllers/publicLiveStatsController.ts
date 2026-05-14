import type { Request, Response } from "express";
import { getPublicLiveStats } from "../services/publicLiveStatsService.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("publicLiveStats");

export async function getLiveStats(_req: Request, res: Response): Promise<void> {
  try {
    const stats = await getPublicLiveStats();
    res.json({ ok: true, stats });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("live_stats_failed", { err: msg });
    res.status(500).json({ ok: false, code: "live_stats_failed" });
  }
}
