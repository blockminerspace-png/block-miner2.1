import type { ContributionDelta } from "../domain/types.js";
import type { ApplyContributionResult } from "../domain/tournament-engine.types.js";
import {
  applyScoreDelta,
  insertContributionIdempotent,
} from "../infrastructure/repositories/tournament.repository.js";
import { invalidateLeaderboardCache } from "../infrastructure/cache/leaderboard.cache.js";
import { touchEngineStatsOnContribution } from "./tournament-engine-metrics.service.js";
import _prisma from "../../../src/db/prisma.js";
import loggerLib from "../../../utils/logger.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;
const logger = loggerLib.child("ScoreProjection");

export async function applyContribution(
  tournamentId: number,
  delta: ContributionDelta,
): Promise<ApplyContributionResult> {
  let applied = false;
  try {
    applied = await prisma.$transaction(async (tx: typeof prisma) => {
      const result = await insertContributionIdempotent(tournamentId, delta, tx);
      if (result === "duplicate") {
        logger.info("tournament.contribution.duplicate", {
          tournamentId,
          userId: delta.userId,
          sourceType: delta.sourceType,
          sourceId: delta.sourceId,
          metricValue: delta.metricValue,
        });
        return false;
      }
      await applyScoreDelta(tournamentId, delta.userId, delta.metricValue, delta.eventAt, tx);
      return true;
    });
  } catch (err: unknown) {
    logger.error("tournament.contribution.failed", {
      tournamentId,
      userId: delta.userId,
      sourceId: delta.sourceId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  if (!applied) {
    return { applied: false, reason: "duplicate" };
  }

  logger.info("tournament.contribution.applied", {
    tournamentId,
    userId: delta.userId,
    sourceType: delta.sourceType,
    sourceId: delta.sourceId,
    metricValue: delta.metricValue,
    eventAt: delta.eventAt.toISOString(),
  });

  await invalidateLeaderboardCache(tournamentId);
  await touchEngineStatsOnContribution(
    tournamentId,
    delta.userId,
    delta.metricValue,
    delta.eventAt,
  );

  return { applied: true, reason: "inserted" };
}
