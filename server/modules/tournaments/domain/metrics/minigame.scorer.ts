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

/**
 * MINIGAME_WINS: 1 valid win (reward granted) = 1 point across all site minigames.
 * Reconcile counts GameSessionLog rows with success + rewardGranted in the window.
 */
export class MinigameWinsScorer implements MetricScorer {
  readonly metric: TournamentMetric = "MINIGAME_WINS";

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
    window: TournamentWindow,
    opts?: { userId?: number },
  ): Promise<Map<number, ScoreBreakdown>> {
    const upper = upperBound(tournament);
    const endAt = window.endsAt < upper ? window.endsAt : upper;

    const rows = await prisma.gameSessionLog.groupBy({
      by: ["userId"],
      where: {
        success: true,
        rewardGranted: true,
        createdAt: { gte: window.startsAt, lte: endAt },
        ...(opts?.userId != null ? { userId: opts.userId } : {}),
      },
      _count: { id: true },
    });

    const map = new Map<number, ScoreBreakdown>();
    for (const r of rows) {
      const total = Number(r._count.id ?? 0);
      if (total <= 0) continue;
      map.set(r.userId, { total, txCount: total });
    }
    return map;
  }
}

export function createMinigameScorers(): MinigameWinsScorer[] {
  return [new MinigameWinsScorer()];
}
