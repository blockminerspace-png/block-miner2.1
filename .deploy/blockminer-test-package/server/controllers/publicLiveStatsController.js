import { getPublicLiveStats } from "../services/publicLiveStatsService.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("publicLiveStats");

export async function getLiveStats(req, res) {
  try {
    const stats = await getPublicLiveStats();
    res.json({ ok: true, stats });
  } catch (err) {
    logger.error("live_stats_failed", { err: err?.message || String(err) });
    res.status(500).json({ ok: false, code: "live_stats_failed" });
  }
}
