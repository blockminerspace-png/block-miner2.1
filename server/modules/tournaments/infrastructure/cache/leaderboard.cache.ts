import { getRedis } from "../../../../services/redisClient.js";
import { bumpCacheVersion } from "../../application/tournament-engine-metrics.service.js";
import loggerLib from "../../../../utils/logger.js";

const logger = loggerLib.child("TournamentCache");

const LB_PREFIX = "tournament:lb:";
const META_PREFIX = "tournament:meta:";
const DEFAULT_TTL_SEC = 60;

function lbKey(tournamentId: number): string {
  return `${LB_PREFIX}${tournamentId}:top100`;
}

function metaKey(tournamentId: number): string {
  return `${META_PREFIX}${tournamentId}:participants`;
}

export async function invalidateLeaderboardCache(tournamentId: number): Promise<void> {
  const redis = getRedis();
  const version = await bumpCacheVersion(tournamentId);
  if (!redis) {
    logger.info("tournament.cache.invalidated", { tournamentId, cacheVersion: version, redis: false });
    return;
  }
  try {
    await redis.del(lbKey(tournamentId), metaKey(tournamentId));
    logger.info("tournament.cache.invalidated", { tournamentId, cacheVersion: version });
  } catch (err: unknown) {
    logger.warn("tournament.cache.invalidate_failed", {
      tournamentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getCachedLeaderboard<T>(tournamentId: number): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(lbKey(tournamentId));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setCachedLeaderboard<T>(tournamentId: number, data: T): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.setex(lbKey(tournamentId), DEFAULT_TTL_SEC, JSON.stringify(data));
  } catch {
    /* non-fatal */
  }
}
