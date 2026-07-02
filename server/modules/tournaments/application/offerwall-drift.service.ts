import _prisma from "../../../src/db/prisma.js";
import type { OfferwallDriftReport, DriftDetail } from "../domain/tournament-engine.types.js";
import type { TournamentRecord } from "../domain/types.js";
import { providersForOfferwallMetric } from "../domain/tournament-action.providers.js";
import { touchEngineStatsOnReconcile, tournamentUpperBound } from "./tournament-engine-metrics.service.js";
import { touchScoresReconciledAt } from "../infrastructure/repositories/tournament.repository.js";
import loggerLib from "../../../utils/logger.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;
const logger = loggerLib.child("OfferwallDrift");

const INTEGER_TOLERANCE = 0;

function providersForMetric(metric: string): string[] {
  return [...providersForOfferwallMetric(metric)];
}

async function sumActionsByUser(
  tournament: TournamentRecord,
): Promise<Map<number, number>> {
  const upper = tournamentUpperBound(tournament);
  const providers = providersForMetric(tournament.metric);
  if (providers.length === 0) return new Map();

  const rows = await prisma.tournamentAction.groupBy({
    by: ["userId"],
    where: {
      tournamentEligible: true,
      provider: { in: providers },
      executedAtUTC: { gte: tournament.startsAt, lte: upper },
    },
    _sum: { actionCount: true },
  });

  const map = new Map<number, number>();
  for (const r of rows) {
    map.set(r.userId, Number(r._sum.actionCount ?? 0));
  }
  return map;
}

async function sumContributionsByUser(tournamentId: number): Promise<Map<number, number>> {
  const rows = await prisma.tournamentScoreContribution.groupBy({
    by: ["userId"],
    where: { tournamentId },
    _sum: { metricValue: true },
  });
  const map = new Map<number, number>();
  for (const r of rows) {
    map.set(r.userId, Number(r._sum.metricValue ?? 0));
  }
  return map;
}

async function getEntryScores(tournamentId: number): Promise<Map<number, number>> {
  const rows = await prisma.tournamentEntry.findMany({
    where: { tournamentId },
    select: { userId: true, score: true },
  });
  const map = new Map<number, number>();
  for (const r of rows) {
    map.set(r.userId, Number(r.score));
  }
  return map;
}

function sumMap(map: Map<number, number>): number {
  let t = 0;
  for (const v of map.values()) t += v;
  return t;
}

/**
 * Detect-only triple reconciliation for offerwall tournaments:
 * SUM(TournamentAction) vs SUM(Contribution) vs TournamentEntry.score
 * Never mutates scores.
 */
export async function detectOfferwallDrift(
  tournament: TournamentRecord,
): Promise<OfferwallDriftReport> {
  const [actions, contributions, entries] = await Promise.all([
    sumActionsByUser(tournament),
    sumContributionsByUser(tournament.id),
    getEntryScores(tournament.id),
  ]);

  const allUserIds = new Set([
    ...actions.keys(),
    ...contributions.keys(),
    ...entries.keys(),
  ]);

  const drifts: DriftDetail[] = [];

  for (const userId of allUserIds) {
    const actionTotal = actions.get(userId) ?? 0;
    const contributionTotal = contributions.get(userId) ?? 0;
    const entryScore = entries.get(userId) ?? 0;
    const deltaAC = actionTotal - contributionTotal;
    const deltaCE = contributionTotal - entryScore;

    if (
      Math.abs(deltaAC) > INTEGER_TOLERANCE ||
      Math.abs(deltaCE) > INTEGER_TOLERANCE
    ) {
      drifts.push({
        userId,
        actionTotal,
        contributionTotal,
        entryScore,
        deltaActionsContributions: deltaAC,
        deltaContributionsEntry: deltaCE,
      });
    }
  }

  const checkedAt = new Date().toISOString();
  const report: OfferwallDriftReport = {
    tournamentId: tournament.id,
    metric: tournament.metric,
    driftCount: drifts.length,
    drifts,
    checkedAt,
    totals: {
      actions: sumMap(actions),
      contributions: sumMap(contributions),
      entries: sumMap(entries),
    },
  };

  if (drifts.length > 0) {
    await prisma.tournamentScoreDrift.createMany({
      data: drifts.map((d) => ({
        tournamentId: tournament.id,
        userId: d.userId,
        actionTotal: d.actionTotal,
        contributionTotal: d.contributionTotal,
        entryScore: d.entryScore,
        deltaActionsContributions: d.deltaActionsContributions,
        deltaContributionsEntry: d.deltaContributionsEntry,
      })),
    });

    for (const d of drifts) {
      logger.warn("tournament.offerwall.drift", {
        tournamentId: tournament.id,
        metric: tournament.metric,
        userId: d.userId,
        actionTotal: d.actionTotal,
        contributionTotal: d.contributionTotal,
        entryScore: d.entryScore,
        deltaActionsContributions: d.deltaActionsContributions,
        deltaContributionsEntry: d.deltaContributionsEntry,
      });
    }
  } else {
    logger.info("tournament.offerwall.reconcile.ok", {
      tournamentId: tournament.id,
      metric: tournament.metric,
      totals: report.totals,
    });
  }

  const openDriftAlerts = await prisma.tournamentScoreDrift.count({
    where: {
      tournamentId: tournament.id,
      detectedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  await touchEngineStatsOnReconcile(tournament.id, openDriftAlerts);
  await touchScoresReconciledAt(tournament.id);

  return report;
}

export async function listRecentDriftAlerts(tournamentId: number, limit = 50) {
  return prisma.tournamentScoreDrift.findMany({
    where: { tournamentId },
    orderBy: { detectedAt: "desc" },
    take: limit,
  });
}
