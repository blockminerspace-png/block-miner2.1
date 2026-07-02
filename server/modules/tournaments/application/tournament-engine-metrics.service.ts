import _prisma from "../../../src/db/prisma.js";
import type { TournamentEngineStats } from "../domain/tournament-engine.types.js";
import type { TournamentRecord } from "../domain/types.js";
import loggerLib from "../../../utils/logger.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;
const logger = loggerLib.child("TournamentEngineMetrics");

type MetricConfig = { engineStats?: Partial<TournamentEngineStats> };

export async function bumpCacheVersion(tournamentId: number): Promise<number> {
  const row = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { version: { increment: 1 } },
    select: { version: true },
  });
  return row.version as number;
}

export async function touchEngineStatsOnContribution(
  tournamentId: number,
  userId: number,
  actionCount: number,
  eventAt: Date,
): Promise<void> {
  const [participantCount, leader, tournament] = await Promise.all([
    prisma.tournamentEntry.count({ where: { tournamentId, score: { gt: 0 } } }),
    prisma.tournamentEntry.findFirst({
      where: { tournamentId },
      orderBy: { score: "desc" },
      select: { score: true },
    }),
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { metricConfig: true, version: true },
    }),
  ]);

  const prev = (tournament?.metricConfig as MetricConfig | null)?.engineStats ?? {};
  const totalActions = (prev.totalActions ?? 0) + actionCount;

  const engineStats: TournamentEngineStats = {
    participants: participantCount,
    totalActions,
    leaderScore: Number(leader?.score ?? 0),
    lastContributionAt: eventAt.toISOString(),
    lastReconcileAt: prev.lastReconcileAt ?? null,
    cacheVersion: tournament?.version ?? 0,
    lastDriftCheckAt: prev.lastDriftCheckAt ?? null,
    openDriftAlerts: prev.openDriftAlerts ?? 0,
  };

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: {
      metricConfig: {
        ...((tournament?.metricConfig as object) ?? {}),
        engineStats,
      },
    },
  });

  logger.info("tournament.engine_stats.updated", {
    tournamentId,
    userId,
    participants: engineStats.participants,
    totalActions: engineStats.totalActions,
    leaderScore: engineStats.leaderScore,
  });
}

export async function touchEngineStatsOnReconcile(
  tournamentId: number,
  openDriftAlerts: number,
): Promise<void> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { metricConfig: true, version: true },
  });
  const prev = (tournament?.metricConfig as MetricConfig | null)?.engineStats ?? {};
  const now = new Date().toISOString();

  const [participantCount, leader, actionAgg] = await Promise.all([
    prisma.tournamentEntry.count({ where: { tournamentId, score: { gt: 0 } } }),
    prisma.tournamentEntry.findFirst({
      where: { tournamentId },
      orderBy: { score: "desc" },
      select: { score: true },
    }),
    prisma.tournamentScoreContribution.aggregate({
      where: { tournamentId },
      _sum: { metricValue: true },
    }),
  ]);

  const engineStats: TournamentEngineStats = {
    participants: participantCount,
    totalActions: Number(actionAgg._sum.metricValue ?? prev.totalActions ?? 0),
    leaderScore: Number(leader?.score ?? 0),
    lastContributionAt: prev.lastContributionAt ?? null,
    lastReconcileAt: now,
    cacheVersion: tournament?.version ?? 0,
    lastDriftCheckAt: now,
    openDriftAlerts,
  };

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: {
      metricConfig: {
        ...((tournament?.metricConfig as object) ?? {}),
        engineStats,
      },
    },
  });
}

export async function getEngineStats(tournamentId: number): Promise<TournamentEngineStats | null> {
  const row = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { metricConfig: true, version: true, scoresReconciledAt: true },
  });
  if (!row) return null;
  const cfg = row.metricConfig as MetricConfig | null;
  if (cfg?.engineStats) {
    const s = cfg.engineStats;
    return {
      participants: s.participants ?? 0,
      totalActions: s.totalActions ?? 0,
      leaderScore: s.leaderScore ?? 0,
      lastContributionAt: s.lastContributionAt ?? null,
      lastReconcileAt: s.lastReconcileAt ?? null,
      cacheVersion: row.version,
      lastDriftCheckAt: s.lastDriftCheckAt ?? null,
      openDriftAlerts: s.openDriftAlerts ?? 0,
    };
  }
  return {
    participants: 0,
    totalActions: 0,
    leaderScore: 0,
    lastContributionAt: null,
    lastReconcileAt: row.scoresReconciledAt?.toISOString() ?? null,
    cacheVersion: row.version,
    lastDriftCheckAt: null,
    openDriftAlerts: 0,
  };
}

export function isOfferwallIncrementalMetric(metric: string): boolean {
  return metric === "OFFERS_INTERNAL" || metric === "OFFERS_EXTERNAL" || metric === "OFFERS_ALL";
}

export function tournamentUpperBound(tournament: Pick<TournamentRecord, "endsAt">): Date {
  const now = new Date();
  return tournament.endsAt < now ? tournament.endsAt : now;
}
