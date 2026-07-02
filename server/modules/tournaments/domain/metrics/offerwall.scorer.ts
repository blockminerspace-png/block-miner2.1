import _prisma from "../../../../src/db/prisma.js";
import type { TournamentActionPayload } from "../events/tournament-action.event.js";
import type { MetricScorer } from "./metric-scorer.interface.js";
import type {
  ContributionDelta,
  ScoreBreakdown,
  TournamentMetric,
  TournamentRecord,
  TournamentWindow,
} from "../types.js";
import { windowContains } from "../types.js";
import {
  contributionSourceId,
  providerAllowedForMetric,
} from "../tournament-action.providers.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

function upperBound(tournament: TournamentRecord): Date {
  const now = new Date();
  return tournament.endsAt < now ? tournament.endsAt : now;
}

async function sumContributionsByUser(
  tournamentId: number,
  userId?: number,
): Promise<Map<number, ScoreBreakdown>> {
  const rows = await prisma.tournamentScoreContribution.groupBy({
    by: ["userId"],
    where: {
      tournamentId,
      ...(userId != null ? { userId } : {}),
    },
    _sum: { metricValue: true },
    _count: { id: true },
  });

  const map = new Map<number, ScoreBreakdown>();
  for (const r of rows) {
    map.set(r.userId, {
      total: Number(r._sum.metricValue ?? 0),
      txCount: r._count.id,
    });
  }
  return map;
}

export class OffersMetricScorer implements MetricScorer {
  readonly metric: TournamentMetric;

  constructor(metric: "OFFERS_INTERNAL" | "OFFERS_EXTERNAL" | "OFFERS_ALL") {
    this.metric = metric;
  }

  onTournamentAction(
    event: TournamentActionPayload,
    tournament: TournamentRecord,
  ): ContributionDelta | null {
    if (!event.tournamentEligible || event.actionCount <= 0) return null;
    if (tournament.metric !== this.metric) return null;
    if (!providerAllowedForMetric(event.provider, this.metric)) return null;

    const eventAt = new Date(event.executedAtUTC);
    if (!windowContains(tournament, eventAt, upperBound(tournament))) return null;

    return {
      userId: event.userId,
      sourceType: "action",
      sourceId: contributionSourceId(event.provider, event.sourceId),
      metricValue: event.actionCount,
      eventAt,
      metadata: {
        provider: event.provider,
        actionId: event.actionId,
      },
    };
  }

  async reconcile(
    tournament: TournamentRecord,
    _window: TournamentWindow,
    opts?: { userId?: number },
  ): Promise<Map<number, ScoreBreakdown>> {
    return sumContributionsByUser(tournament.id, opts?.userId);
  }
}

export function createOffersScorers(): OffersMetricScorer[] {
  return [
    new OffersMetricScorer("OFFERS_INTERNAL"),
    new OffersMetricScorer("OFFERS_EXTERNAL"),
    new OffersMetricScorer("OFFERS_ALL"),
  ];
}
