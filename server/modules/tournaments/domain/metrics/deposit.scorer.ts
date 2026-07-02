import _prisma from "../../../../src/db/prisma.js";
import type { DepositConfirmedPayload } from "../events/deposit-confirmed.event.js";
import type { MetricScorer } from "./metric-scorer.interface.js";
import type {
  ContributionDelta,
  ScoreBreakdown,
  TournamentRecord,
  TournamentWindow,
} from "../types.js";
import { windowContains } from "../types.js";
import {
  aggregateDepositSummary,
  computeDepositScores,
  getDepositScoreDetailForUser,
} from "../../depositTournamentScore.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

function upperBound(tournament: TournamentRecord): Date {
  const now = new Date();
  return tournament.endsAt < now ? tournament.endsAt : now;
}

export class DepositUsdScorer implements MetricScorer {
  readonly metric = "DEPOSITS_USD" as const;

  onDepositConfirmed(
    event: DepositConfirmedPayload,
    tournament: TournamentRecord,
  ): ContributionDelta | null {
    if (!event.countsForTournament) return null;
    const eventAt = new Date(event.eventAt);
    if (!windowContains(tournament, eventAt, upperBound(tournament))) return null;
    if (event.usdValue <= 0) return null;
    return {
      userId: event.userId,
      sourceType: "deposit",
      sourceId: String(event.transactionId),
      metricValue: event.usdValue,
      eventAt,
      metadata: {
        polAmount: event.polAmount,
        usdRate: event.usdRate,
        txHash: event.txHash,
        source: event.source,
      },
    };
  }

  async reconcile(
    tournament: TournamentRecord,
    window: TournamentWindow,
  ): Promise<Map<number, ScoreBreakdown>> {
    const ub = upperBound(tournament);
    const rows = await prisma.transaction.findMany({
      where: {
        type: "deposit",
        status: "completed",
        countsForTournament: true,
        confirmedEventAt: { gte: window.startsAt, lte: ub },
        usdValueAtConfirmation: { not: null },
      },
      select: {
        userId: true,
        amount: true,
        usdValueAtConfirmation: true,
      },
    });

    const map = new Map<number, ScoreBreakdown>();
    for (const r of rows) {
      const prev = map.get(r.userId) ?? { total: 0, txCount: 0, totalPol: 0 };
      const usd = Number(r.usdValueAtConfirmation);
      const pol = Number(r.amount);
      map.set(r.userId, {
        total: prev.total + usd,
        txCount: prev.txCount + 1,
        totalPol: (prev.totalPol ?? 0) + pol,
      });
    }
    return map;
  }

  async getUserBreakdown(
    userId: number,
    tournament: TournamentRecord,
    window: TournamentWindow,
  ): Promise<unknown> {
    const ub = upperBound(tournament);
    const rows = await prisma.transaction.findMany({
      where: {
        userId,
        type: "deposit",
        status: "completed",
        countsForTournament: true,
        confirmedEventAt: { gte: window.startsAt, lte: ub },
      },
      orderBy: [{ confirmedEventAt: "desc" }],
      take: 200,
      select: {
        id: true,
        amount: true,
        usdValueAtConfirmation: true,
        usdRateAtConfirmation: true,
        confirmedEventAt: true,
        txHash: true,
        rawTx: true,
      },
    });

    let totalUsd = 0;
    let totalPol = 0;
    let txCount = 0;
    const deposits = rows.map((d: {
      id: number;
      amount: unknown;
      usdValueAtConfirmation: unknown;
      usdRateAtConfirmation: unknown;
      confirmedEventAt: Date | null;
      txHash: string | null;
      rawTx: string | null;
    }) => {
      const usd = Number(d.usdValueAtConfirmation ?? 0);
      const pol = Number(d.amount);
      totalUsd += usd;
      totalPol += pol;
      txCount += 1;
      let source: string | null = null;
      try {
        source = d.rawTx ? (JSON.parse(d.rawTx) as { source?: string }).source ?? null : null;
      } catch { /* ignore */ }
      return {
        id: d.id,
        amountPol: Number(d.amount),
        usdValue: usd,
        usdRate: d.usdRateAtConfirmation != null ? Number(d.usdRateAtConfirmation) : null,
        confirmedEventAt: d.confirmedEventAt?.toISOString() ?? null,
        txHash: d.txHash,
        source,
      };
    });

    return {
      rankingUnit: "usd" as const,
      breakdown: { total: totalUsd, txCount, totalUsd, totalPol },
      deposits,
    };
  }

  async getAggregateSummary(tournament: TournamentRecord, window: TournamentWindow): Promise<unknown> {
    const ub = upperBound(tournament);
    const rows = await prisma.transaction.findMany({
      where: {
        type: "deposit",
        status: "completed",
        countsForTournament: true,
        confirmedEventAt: { gte: window.startsAt, lte: ub },
        usdValueAtConfirmation: { not: null },
      },
      select: {
        userId: true,
        amount: true,
        usdValueAtConfirmation: true,
      },
    });
    const participants = new Set<number>();
    let totalUsd = 0;
    let totalPol = 0;
    let largestUsd = 0;
    let largestPol = 0;
    for (const r of rows) {
      participants.add(r.userId);
      const usd = Number(r.usdValueAtConfirmation);
      const pol = Number(r.amount);
      totalUsd += usd;
      totalPol += pol;
      if (usd > largestUsd) largestUsd = usd;
      if (pol > largestPol) largestPol = pol;
    }
    return {
      rankingUnit: "usd" as const,
      totalUsd,
      totalPol,
      txCount: rows.length,
      participantCount: participants.size,
      largestDepositUsd: largestUsd,
      largestDepositPol: largestPol,
      remainderUsd: Math.max(0, totalUsd - largestUsd),
      remainderPol: Math.max(0, totalPol - largestPol),
      remainderTxCount: Math.max(0, rows.length - (largestUsd > 0 ? 1 : 0)),
    };
  }
}

export class DepositPolScorer implements MetricScorer {
  readonly metric = "DEPOSITS_POL" as const;

  onDepositConfirmed(
    event: DepositConfirmedPayload,
    tournament: TournamentRecord,
  ): ContributionDelta | null {
    if (!event.countsForTournament) return null;
    const eventAt = new Date(event.eventAt);
    if (!windowContains(tournament, eventAt, upperBound(tournament))) return null;
    if (event.polAmount <= 0) return null;
    return {
      userId: event.userId,
      sourceType: "deposit",
      sourceId: String(event.transactionId),
      metricValue: event.polAmount,
      eventAt,
      metadata: { txHash: event.txHash, source: event.source },
    };
  }

  async reconcile(
    tournament: TournamentRecord,
    window: TournamentWindow,
  ): Promise<Map<number, ScoreBreakdown>> {
    const ub = upperBound(tournament);
    return computeDepositScores(window.startsAt, ub);
  }

  async getUserBreakdown(
    userId: number,
    tournament: TournamentRecord,
    window: TournamentWindow,
  ): Promise<unknown> {
    const ub = upperBound(tournament);
    return getDepositScoreDetailForUser(userId, window.startsAt, ub);
  }

  async getAggregateSummary(tournament: TournamentRecord, window: TournamentWindow): Promise<unknown> {
    const ub = upperBound(tournament);
    return aggregateDepositSummary(window.startsAt, ub);
  }
}
