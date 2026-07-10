import _prisma from "../../src/db/prisma.js";
import { rankingUserSelect, aggregateUserHashrates } from "../../services/networkHashrateService.js";
import {
  formatUtcWindowLabel,
} from "./offerwallTournamentScore.js";
import {
  computeDepositScores,
  aggregateDepositSummary,
  getDepositScoreDetailForUser,
} from "./depositTournamentScore.js";
import { snapWindowForType, snapWindowForActiveTournament } from "./tournamentWindow.js";
import {
  backfillMinigameTournamentFromLogs,
  resolveTournamentStatusForWindow,
} from "./application/minigame-backfill.service.js";
import { isTournamentSkipGetRecomputeEnabled, isTournamentIncrementalScoringEnabled } from "./config/feature-flags.js";
import { OFFERS_INCREMENTAL_METRICS, MINIGAME_INCREMENTAL_METRICS } from "./domain/tournament-action.providers.js";
import { registerTournamentMetricScorers } from "./domain/metrics/register-scorers.js";
import { getMetricScorer } from "./domain/metrics/metric-scorer.registry.js";
import { getCachedLeaderboard, setCachedLeaderboard, invalidateLeaderboardCache } from "./infrastructure/cache/leaderboard.cache.js";
import { normalizeDepositSummary, isDepositTournamentMetric, depositRankingUnit } from "./depositTournamentPresentation.js";
import { reconcileTournament } from "./application/tournament-engine.js";
import { processTournamentOutboxBatch } from "./infrastructure/outbox/tournament-outbox.processor.js";

import loggerLib from "../../utils/logger.js";
const logger = loggerLib.child("tournaments.service");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

type Tournament = { id: number; name: string; metric: string; startsAt: Date; endsAt: Date; status: string; prizes?: any[] };
type TournamentEntry = { id: number; tournamentId: number; userId: number; score: number; rank: number | null; rewardGranted: boolean; rewardGrantedAt: Date | null; createdAt: Date; updatedAt: Date };
type TournamentPrize = { id: number; tournamentId: number; rankFrom: number; rankTo: number; prizeType: string; polAmount: number | null; blkAmount: number | null; boostHashRate: number | null; boostHours: number | null; minerId: number | null; minerCount: number | null };

export const LEADERBOARD_LIMIT = 100;

// ─── Score computation ──────────────────────────────────────────────────────

export async function computeScoresForTournament(tournament: Tournament): Promise<void> {
  const now = new Date();
  // Never count events beyond the tournament's end — cap at min(now, endsAt).
  const upperBound = tournament.endsAt < now ? tournament.endsAt : now;
  const { metric, startsAt } = tournament;

  if (metric === "HASHRATE") {
    // Load all users with active miners/powers, snapshot current hashrate
    const { loadUsersForPowerStatsRanking } = await import("../../services/networkHashrateService.js");
    const users = await loadUsersForPowerStatsRanking(prisma as any, 0, now, true);
    const updates: { userId: number; score: number }[] = users
      .map((u: any) => ({ userId: u.id as number, score: aggregateUserHashrates(u).totalHashrate }))
      .filter((r: { userId: number; score: number }) => r.score > 0);
    await batchUpsertEntries(tournament.id, updates);
    return;
  }

  if (metric === "BLOCKS_MINED") {
    const rows = await prisma.blockMinerReward.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: startsAt, lte: upperBound} },
      _count: { id: true },
    });
    await batchUpsertEntries(
      tournament.id,
      rows.map((r) => ({ userId: r.userId, score: r._count.id })),
    );
    return;
  }

  if (metric === "CHECKINS") {
    const rows = await prisma.dailyCheckin.groupBy({
      by: ["userId"],
      where: {
        OR: [
          { confirmedAt: { gte: startsAt, lte: upperBound} },
          { createdAt: { gte: startsAt, lte: upperBound}, status: "confirmed" },
        ],
      },
      _count: { id: true },
    });
    await batchUpsertEntries(
      tournament.id,
      rows.map((r) => ({ userId: r.userId, score: r._count.id })),
    );
    return;
  }

  if (metric === "TASKS_COMPLETED") {
    const rows = await prisma.userDailyTaskProgress.groupBy({
      by: ["userId"],
      where: { completedAt: { gte: startsAt, lte: upperBound} },
      _count: { id: true },
    });
    await batchUpsertEntries(
      tournament.id,
      rows.map((r) => ({ userId: r.userId, score: r._count.id })),
    );
    return;
  }

  if (metric === "DEPOSITS_POL") {
    if (isTournamentIncrementalScoringEnabled()) {
      registerTournamentMetricScorers();
      const scorer = getMetricScorer("DEPOSITS_POL");
      if (scorer) {
        const scores = await scorer.reconcile(
          { id: tournament.id, name: tournament.name, metric: "DEPOSITS_POL", startsAt, endsAt: tournament.endsAt, status: tournament.status as "ACTIVE" },
          { startsAt, endsAt: upperBound },
        );
        await batchUpsertEntries(
          tournament.id,
          Array.from(scores.entries())
            .map(([userId, b]) => ({ userId, score: b.total }))
            .filter((r) => r.score > 0),
        );
        return;
      }
    }
    const scores = await computeDepositScores(startsAt, upperBound);
    await batchUpsertEntries(
      tournament.id,
      Array.from(scores.entries())
        .map(([userId, b]) => ({ userId, score: b.total }))
        .filter((r) => r.score > 0),
    );
    return;
  }

  if (metric === "DEPOSITS_USD") {
    registerTournamentMetricScorers();
    const scorer = getMetricScorer("DEPOSITS_USD");
    if (!scorer) throw new Error("DEPOSITS_USD scorer not registered");
    const scores = await scorer.reconcile(
      { id: tournament.id, name: tournament.name, metric: "DEPOSITS_USD", startsAt, endsAt: tournament.endsAt, status: tournament.status as "ACTIVE" },
      { startsAt, endsAt: upperBound },
    );
    await batchUpsertEntries(
      tournament.id,
      Array.from(scores.entries())
        .map(([userId, b]) => ({ userId, score: b.total }))
        .filter((r) => r.score > 0),
    );
    return;
  }

  if (
    metric === "OFFERS_INTERNAL" ||
    metric === "OFFERS_EXTERNAL" ||
    metric === "OFFERS_ALL"
  ) {
    // Engine V2 offerwall: rankings come only from incremental contributions.
    return;
  }
}

async function batchUpsertEntries(
  tournamentId: number,
  rows: { userId: number; score: number }[],
): Promise<void> {
  const active = rows.filter((r) => r.score > 0);
  const activeIds = active.map((r) => r.userId);

  if (activeIds.length === 0) {
    await prisma.tournamentEntry.deleteMany({ where: { tournamentId } });
    await invalidateLeaderboardCache(tournamentId);
    return;
  }

  await prisma.tournamentEntry.deleteMany({
    where: { tournamentId, userId: { notIn: activeIds } },
  });

  for (let i = 0; i < active.length; i += 100) {
    const chunk = active.slice(i, i + 100);
    await Promise.all(
      chunk.map(({ userId, score }) =>
        prisma.tournamentEntry.upsert({
          where: { tournamentId_userId: { tournamentId, userId } },
          update: { score },
          create: { tournamentId, userId, score },
        }),
      ),
    );
  }

  await invalidateLeaderboardCache(tournamentId);
}

// ─── Finalization ───────────────────────────────────────────────────────────

/**
 * Corrige startsAt/endsAt de torneios ACTIVE para janelas UTC canônicas.
 * Só ajusta o ciclo em curso (não salta mensal/semanal para o período seguinte).
 */
export async function alignActiveTournamentWindows(): Promise<number> {
  const now = new Date();
  const active = await prisma.tournament.findMany({
    where: { status: "ACTIVE", type: { in: ["DAILY", "WEEKLY", "MONTHLY"] } },
  });
  let fixed = 0;
  for (const t of active) {
    const snap = snapWindowForActiveTournament(t.type, t.startsAt, t.endsAt, now);
    if (!snap) continue;
    if (t.startsAt.getTime() === snap.start.getTime() && t.endsAt.getTime() === snap.end.getTime()) {
      continue;
    }
    await prisma.tournament.update({
      where: { id: t.id },
      data: { startsAt: snap.start, endsAt: snap.end },
    });
    const isOfferwall = (OFFERS_INCREMENTAL_METRICS as readonly string[]).includes(t.metric);
    const isMinigame = (MINIGAME_INCREMENTAL_METRICS as readonly string[]).includes(t.metric);
    if ((!isOfferwall && !isMinigame) || !isTournamentIncrementalScoringEnabled()) {
      await computeScoresForTournament({ ...t, startsAt: snap.start, endsAt: snap.end });
    }
    fixed++;
    console.info(
      `[tournaments] aligned #${t.id} "${t.name}" → UTC ${snap.start.toISOString()} .. ${snap.end.toISOString()}`,
    );
  }
  return fixed;
}

// Próximo início de ciclo alinhado ao "dia do servidor" (UTC), conforme o tipo.
// Garante newStart > prevEnd (se já passou do próximo limite, pula adiante).
function nextCycleWindow(
  type: string | undefined,
  prevEnd: Date,
  duration: number,
): { newStart: Date; newEnd: Date } {
  const snap = snapWindowForType(type, prevEnd);
  if (!snap) return { newStart: prevEnd, newEnd: new Date(prevEnd.getTime() + duration) };

  // snap contém prevEnd; queremos o ciclo *seguinte*.
  let { start, end } = snap;
  if (start < prevEnd) {
    const next = snapWindowForType(type, end);
    if (next) ({ start, end } = next);
    else return { newStart: prevEnd, newEnd: new Date(prevEnd.getTime() + duration) };
  }
  // Se ainda assim o tempo real avançou demais (cron atrasou), pula até o ciclo atual.
  const now = new Date();
  let safety = 0;
  while (end <= now && safety < 366) {
    const next = snapWindowForType(type, end);
    if (!next) break;
    ({ start, end } = next);
    safety++;
  }
  return { newStart: start, newEnd: end };
}

export async function finalizeTournament(tournamentId: number): Promise<{ ranked: number; rewarded: number; nextId: number | null }> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { prizes: { include: { miner: true } } },
  });
  if (!tournament) throw new Error("Tournament not found");
  if (tournament.status === "ENDED") return { ranked: 0, rewarded: 0, nextId: null };

  // Final score reconcile before ranking (incremental metrics use contribution ledger)
  if (isTournamentIncrementalScoringEnabled()) {
    registerTournamentMetricScorers();
    await reconcileTournament(tournamentId);
  } else {
    await computeScoresForTournament(tournament);
  }

  const entries = await prisma.tournamentEntry.findMany({
    where: { tournamentId },
    orderBy: [{ score: "desc" }, { firstContributionAt: "asc" }],
  });

  let rewarded = 0;
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < entries.length; i++) {
      const rank = i + 1;
      const entry = entries[i];
      const prize = tournament.prizes.find(
        (p) => rank >= p.rankFrom && rank <= p.rankTo,
      );

      await tx.tournamentEntry.update({
        where: { id: entry.id },
        data: {
          rank,
          rewardGranted: !!prize,
          rewardGrantedAt: prize ? new Date() : null,
        },
      });

      if (prize && !entry.rewardGranted) {
        await grantPrize(tx, entry.userId, prize, tournament.name);
        rewarded++;
      }
    }

    await tx.tournament.update({
      where: { id: tournamentId },
      data: { status: "ENDED" },
    });
  });

  // Loop / recurring: spawn next cycle with the same prizes
  let nextId: number | null = null;
  if (tournament.recurring) {
    try {
      const duration = tournament.endsAt.getTime() - tournament.startsAt.getTime();
      const { newStart, newEnd } = nextCycleWindow(
        tournament.type,
        tournament.endsAt,
        duration,
      );
      const next = await prisma.tournament.create({
        data: {
          name: tournament.name,
          description: tournament.description,
          type: tournament.type,
          metric: tournament.metric,
          startsAt: newStart,
          endsAt: newEnd,
          recurring: true,
          status: newStart <= new Date() ? "ACTIVE" : "SCHEDULED",
          prizes: {
            create: tournament.prizes.map((p: TournamentPrize) => ({
              rankFrom: p.rankFrom,
              rankTo: p.rankTo,
              prizeType: p.prizeType,
              polAmount: p.polAmount,
              blkAmount: p.blkAmount,
              boostHashRate: p.boostHashRate,
              boostHours: p.boostHours,
              minerId: p.minerId,
              minerCount: p.minerCount ?? 1,
            })),
          },
        },
      });
      nextId = next.id;
      console.info(`[tournaments] recurring: spawned next cycle #${next.id} for "${tournament.name}"`);
      if (next.status === "ACTIVE" && next.metric === "MINIGAME_WINS") {
        void backfillMinigameTournamentFromLogs(next.id).catch((err) => {
          logger.error(`[tournaments] minigame backfill recurring #${next.id}:`, { error: String(err) });
        });
      }
    } catch (err) {
      logger.error(`[tournaments] failed to spawn next cycle for #${tournamentId}:`, { error: String(err) });
    }
  }

  await invalidateTournamentCaches(tournamentId);
  return { ranked: entries.length, rewarded, nextId };
}

async function invalidateTournamentCaches(tournamentId: number): Promise<void> {
  await invalidateLeaderboardCache(tournamentId);
}

function depositScoreMismatch(stored: number, computed: number, metric: string): boolean {
  const eps = metric === "DEPOSITS_USD" ? 0.01 : 0.0001;
  return Math.abs(stored - computed) > eps;
}

async function grantPrize(
  tx: any,
  userId: number,
  prize: TournamentPrize & { miner?: any },
  tournamentName: string,
): Promise<void> {
  const source = `tournament`;
  const meta = { tournamentName };

  if (prize.prizeType === "POL" && prize.polAmount) {
    await tx.userRewardInbox.create({
      data: {
        userId,
        source,
        status: "pending",
        rewardType: "pol",
        rewardValue: prize.polAmount,
        metaJson: meta,
      },
    });
    return;
  }

  if (prize.prizeType === "BLK" && prize.blkAmount) {
    await tx.userRewardInbox.create({
      data: {
        userId,
        source,
        status: "pending",
        rewardType: "blk",
        rewardValue: prize.blkAmount,
        metaJson: meta,
      },
    });
    return;
  }

  if (prize.prizeType === "MINING_BOOST" && prize.boostHashRate && prize.boostHours) {
    await tx.userRewardInbox.create({
      data: {
        userId,
        source,
        status: "pending",
        rewardType: "hashrate_boost",
        rewardValue: prize.boostHashRate,
        durationHours: prize.boostHours,
        metaJson: meta,
      },
    });
    return;
  }

  if (prize.prizeType === "MACHINE" && prize.miner) {
    const hashRate = Number(prize.miner.baseHashRate ?? 0);
    for (let k = 0; k < (prize.minerCount ?? 1); k++) {
      await tx.userRewardInbox.create({
        data: {
          userId,
          source,
          status: "pending",
          rewardType: "machine",
          rewardValue: hashRate,
          minerId: prize.miner.id,
          minerName: prize.miner.name,
          minerImageUrl: prize.miner.imageUrl ?? null,
          slotSize: prize.miner.slotSize ?? 1,
          metaJson: meta,
        },
      });
    }
  }
}

// ─── Read queries ────────────────────────────────────────────────────────────

const DEFAULT_TYPE_ORDER = ["MONTHLY", "WEEKLY", "DAILY", "CUSTOM"];

export async function getTypeDisplayOrder(): Promise<string[]> {
  const row = await prisma.tournamentDisplayConfig.findUnique({ where: { id: 1 } });
  const order = row?.typeOrder;
  if (Array.isArray(order) && order.every((x) => typeof x === "string")) return order as string[];
  return DEFAULT_TYPE_ORDER;
}

export async function setTypeDisplayOrder(typeOrder: string[]): Promise<string[]> {
  const valid = new Set(["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]);
  const clean = typeOrder.filter((t) => valid.has(t));
  for (const t of valid) if (!clean.includes(t)) clean.push(t);
  await prisma.tournamentDisplayConfig.upsert({
    where: { id: 1 },
    update: { typeOrder: clean },
    create: { id: 1, typeOrder: clean },
  });
  return clean;
}

function sortByTypeOrder<T extends { type: string; startsAt: Date }>(list: T[], order: string[]): T[] {
  const idx = (t: string) => {
    const i = order.indexOf(t);
    return i === -1 ? order.length : i;
  };
  return [...list].sort((a, b) => {
    const d = idx(a.type) - idx(b.type);
    if (d !== 0) return d;
    return a.startsAt.getTime() - b.startsAt.getTime();
  });
}

export async function listActiveTournaments() {
  const order = await getTypeDisplayOrder();
  const now = new Date();
  const rows = await prisma.tournament.findMany({
    where: {
      status: { in: ["ACTIVE", "SCHEDULED"] },
    },
    include: {
      prizes: { orderBy: { rankFrom: "asc" }, include: { miner: { select: { id: true, name: true, imageUrl: true, baseHashRate: true } } } },
      _count: { select: { entries: true } },
    },
    orderBy: { startsAt: "asc" },
  });
  return sortByTypeOrder(
    rows.map((t: { startsAt: Date; endsAt: Date }) => ({
      ...t,
      windowUtc: formatUtcWindowLabel(t.startsAt, t.endsAt),
      windowUtcNow: formatUtcWindowLabel(t.startsAt, t.endsAt < now ? t.endsAt : now),
    })),
    order,
  );
}

function isDepositMetric(metric: string): boolean {
  return metric === "DEPOSITS_POL" || metric === "DEPOSITS_USD";
}

/** POL totals for USD-ranked deposit tournaments (informational; ranking uses USD). */
async function enrichDepositLeaderboardWithPolTotals<T extends { userId: number }>(
  top: T[],
  startsAt: Date,
  upperBound: Date,
): Promise<Array<T & { scorePol: number }>> {
  if (top.length === 0) return [];

  const userIds = top.map((e) => e.userId);
  const rows = await prisma.transaction.groupBy({
    by: ["userId"],
    where: {
      userId: { in: userIds },
      type: "deposit",
      status: "completed",
      countsForTournament: true,
      confirmedEventAt: { gte: startsAt, lte: upperBound },
    },
    _sum: { amount: true },
  });
  const polByUser = new Map<number, number>(
    rows.map((r: { userId: number; _sum: { amount: unknown } }) => [
      r.userId,
      Number(r._sum.amount ?? 0),
    ]),
  );

  return top.map((entry) => ({
    ...entry,
    scorePol: polByUser.get(entry.userId) ?? 0,
  }));
}

export async function getTournamentWithLeaderboard(tournamentId: number, userId?: number) {
  let tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      prizes: { orderBy: { rankFrom: "asc" }, include: { miner: { select: { id: true, name: true, imageUrl: true, baseHashRate: true } } } },
      _count: { select: { entries: true } },
    },
  });
  if (!tournament) return null;

  let scoresComputedAt: string | null = null;
  const skipRecompute = isTournamentSkipGetRecomputeEnabled();
  if (tournament.status === "ACTIVE" && !skipRecompute) {
    await computeScoresForTournament(tournament);
    scoresComputedAt = new Date().toISOString();
    tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        prizes: { orderBy: { rankFrom: "asc" }, include: { miner: { select: { id: true, name: true, imageUrl: true, baseHashRate: true } } } },
        _count: { select: { entries: true } },
      },
    });
    if (!tournament) return null;
  } else if (tournament.status === "ACTIVE") {
    scoresComputedAt = tournament.scoresReconciledAt?.toISOString() ?? null;
  }

  type TopEntry = Awaited<ReturnType<typeof prisma.tournamentEntry.findMany>>[number];
  const upperBound = tournament.endsAt < new Date() ? tournament.endsAt : new Date();
  let top: TopEntry[] | null = await getCachedLeaderboard<TopEntry[]>(tournamentId);
  if (!top) {
    top = await prisma.tournamentEntry.findMany({
      where: { tournamentId },
      orderBy: [{ score: "desc" }, { firstContributionAt: "asc" }],
      take: LEADERBOARD_LIMIT,
      include: {
        user: {
          select: { id: true, username: true, name: true },
        },
      },
    });
    await setCachedLeaderboard(tournamentId, top);
  }
  if (tournament.metric === "DEPOSITS_USD" && top && top.length > 0) {
    top = await enrichDepositLeaderboardWithPolTotals(top, tournament.startsAt, upperBound);
  }

  let myEntry: TournamentEntry | null = null;
  let myRankLive: number | null = null;
  let myDepositBreakdown: Awaited<ReturnType<typeof getDepositScoreDetailForUser>> | null = null;
  const depositMetric = isDepositMetric(tournament.metric);

  if (userId) {
    myEntry = await prisma.tournamentEntry.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
    });
    if (myEntry) {
      myRankLive =
        (await prisma.tournamentEntry.count({
          where: { tournamentId, score: { gt: myEntry.score } },
        })) + 1;
    }
    if (depositMetric) {
      registerTournamentMetricScorers();
      const scorer = getMetricScorer(tournament.metric as "DEPOSITS_POL" | "DEPOSITS_USD");
      if (scorer?.getUserBreakdown) {
        myDepositBreakdown = (await scorer.getUserBreakdown(
          userId,
          { id: tournament.id, name: tournament.name, metric: tournament.metric as "DEPOSITS_POL" | "DEPOSITS_USD", startsAt: tournament.startsAt, endsAt: tournament.endsAt, status: tournament.status as "ACTIVE" },
          { startsAt: tournament.startsAt, endsAt: upperBound },
        )) as typeof myDepositBreakdown;
      } else {
        myDepositBreakdown = await getDepositScoreDetailForUser(
          userId,
          tournament.startsAt,
          upperBound,
        );
      }
    }
  }

  return {
    tournament: {
      ...tournament,
      depositRankingUnit: isDepositTournamentMetric(tournament.metric)
        ? depositRankingUnit(tournament.metric)
        : undefined,
      windowUtc: formatUtcWindowLabel(tournament.startsAt, tournament.endsAt),
      windowUtcNow: formatUtcWindowLabel(
        tournament.startsAt,
        tournament.endsAt < new Date() ? tournament.endsAt : new Date(),
      ),
    },
    top,
    myEntry,
    myRankLive,
    scoresComputedAt,
    myDepositBreakdown: depositMetric && myDepositBreakdown
      ? { breakdown: (myDepositBreakdown as { breakdown: Record<string, unknown> }).breakdown }
      : null,
  };
}

export async function getUserTournamentHistory(userId: number) {
  return prisma.tournamentEntry.findMany({
    where: { userId, tournament: { status: { in: ["ENDED", "ACTIVE"] } } },
    include: {
      tournament: {
        select: { id: true, name: true, type: true, metric: true, status: true, endsAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

// ─── Admin queries ────────────────────────────────────────────────────────────

export async function adminListTournaments() {
  const order = await getTypeDisplayOrder();
  const rows = await prisma.tournament.findMany({
    include: {
      prizes: { orderBy: { rankFrom: "asc" }, include: { miner: { select: { id: true, name: true, imageUrl: true, baseHashRate: true } } } },
      _count: { select: { entries: true } },
    },
    orderBy: { startsAt: "desc" },
  });
  return sortByTypeOrder(rows, order);
}

export async function adminCreateTournament(data: {
  name: string;
  description?: string;
  type: "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
  metric: "HASHRATE" | "BLOCKS_MINED" | "CHECKINS" | "TASKS_COMPLETED" | "DEPOSITS_POL" | "DEPOSITS_USD" | "OFFERS_INTERNAL" | "OFFERS_EXTERNAL" | "OFFERS_ALL" | "MINIGAME_WINS";
  startsAt: Date;
  endsAt: Date;
  recurring?: boolean;
  prizes: Array<{
    rankFrom: number;
    rankTo: number;
    prizeType: "POL" | "BLK" | "MINING_BOOST" | "MACHINE";
    polAmount?: number;
    blkAmount?: number;
    boostHashRate?: number;
    boostHours?: number;
    minerId?: number;
    minerCount?: number;
  }>;
}) {
  // DAILY/WEEKLY/MONTHLY: snap pra janela do calendário (00:00 UTC = 21:00 BRT).
  // CUSTOM: não aplica snap — datas exatas do admin são respeitadas.
  let startsAt = data.startsAt;
  let endsAt = data.endsAt;
  if (data.type !== "CUSTOM") {
    const snap = snapWindowForType(data.type, data.startsAt);
    if (snap) { startsAt = snap.start; endsAt = snap.end; }
  }

  const now = new Date();
  const status = resolveTournamentStatusForWindow(startsAt, endsAt, now);

  const tournament = await prisma.tournament.create({
    data: {
      name: data.name,
      description: data.description,
      type: data.type,
      metric: data.metric,
      startsAt,
      endsAt,
      status,
      recurring: data.recurring ?? false,
      prizes: {
        create: data.prizes.map((p) => ({
          rankFrom: p.rankFrom,
          rankTo: p.rankTo,
          prizeType: p.prizeType,
          polAmount: p.polAmount ?? null,
          blkAmount: p.blkAmount ?? null,
          boostHashRate: p.boostHashRate ?? null,
          boostHours: p.boostHours ?? null,
          minerId: p.minerId ?? null,
          minerCount: p.minerCount ?? 1,
        })),
      },
    },
    include: { prizes: true },
  });

  if (status === "ACTIVE" && data.metric === "MINIGAME_WINS") {
    void backfillMinigameTournamentFromLogs(tournament.id).catch((err) => {
      logger.error(`[tournaments] minigame backfill failed for #${tournament.id}:`, { error: String(err) });
    });
  }

  return tournament;
}

export async function adminUpdateTournament(
  tournamentId: number,
  data: {
    name?: string;
    description?: string | null;
    type?: "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
    metric?: "HASHRATE" | "BLOCKS_MINED" | "CHECKINS" | "TASKS_COMPLETED" | "DEPOSITS_POL" | "DEPOSITS_USD" | "OFFERS_INTERNAL" | "OFFERS_EXTERNAL" | "OFFERS_ALL" | "MINIGAME_WINS";
    startsAt?: Date;
    endsAt?: Date;
    recurring?: boolean;
    prizes?: Array<{
      rankFrom: number;
      rankTo: number;
      prizeType: "POL" | "BLK" | "MINING_BOOST" | "MACHINE";
      polAmount?: number;
      blkAmount?: number;
      boostHashRate?: number;
      boostHours?: number;
      minerId?: number;
      minerCount?: number;
    }>;
  },
) {
  const existing = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!existing) throw new Error("Tournament not found");
  if (existing.status === "ENDED" || existing.status === "CANCELLED") {
    throw new Error("Cannot edit an ended or cancelled tournament");
  }

  return prisma.$transaction(async (tx) => {
    if (data.prizes) {
      await tx.tournamentPrize.deleteMany({ where: { tournamentId } });
    }
    return tx.tournament.update({
      where: { id: tournamentId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.metric !== undefined ? { metric: data.metric } : {}),
        ...(data.startsAt !== undefined ? { startsAt: data.startsAt } : {}),
        ...(data.endsAt !== undefined ? { endsAt: data.endsAt } : {}),
        ...(data.recurring !== undefined ? { recurring: data.recurring } : {}),
        ...(data.prizes
          ? {
              prizes: {
                create: data.prizes.map((p) => ({
                  rankFrom: p.rankFrom,
                  rankTo: p.rankTo,
                  prizeType: p.prizeType,
                  polAmount: p.polAmount ?? null,
                  blkAmount: p.blkAmount ?? null,
                  boostHashRate: p.boostHashRate ?? null,
                  boostHours: p.boostHours ?? null,
                  minerId: p.minerId ?? null,
                  minerCount: p.minerCount ?? 1,
                })),
              },
            }
          : {}),
      },
      include: { prizes: true },
    });
  }).then(async (updated) => {
    await invalidateTournamentCaches(tournamentId);
    return updated;
  });
}

export async function adminCancelTournament(tournamentId: number) {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!t) throw new Error("Tournament not found");
  if (t.status === "ENDED") throw new Error("Cannot cancel an ended tournament");
  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "CANCELLED" },
  });
  await invalidateTournamentCaches(tournamentId);
  return updated;
}

export async function adminGetEntries(tournamentId: number, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  const [entries, total] = await Promise.all([
    prisma.tournamentEntry.findMany({
      where: { tournamentId },
      orderBy: { score: "desc" },
      skip,
      take: limit,
      include: { user: { select: { id: true, username: true, name: true } } },
    }),
    prisma.tournamentEntry.count({ where: { tournamentId } }),
  ]);
  return { entries, total, page, limit };
}

function tournamentUpperBound(tournament: { endsAt: Date }, now = new Date()): Date {
  return tournament.endsAt < now ? tournament.endsAt : now;
}

function isAuditableMetric(metric: string): boolean {
  return isDepositMetric(metric);
}

export async function adminTournamentScoreAudit(tournamentId: number) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return null;
  if (!isAuditableMetric(tournament.metric)) {
    throw new Error("Score audit is only available for deposit tournament metrics");
  }

  const now = new Date();
  const upperBound = tournamentUpperBound(tournament, now);

  const stored = await prisma.tournamentEntry.findMany({
    where: { tournamentId },
    orderBy: { score: "desc" },
    take: 500,
    include: { user: { select: { id: true, username: true, name: true } } },
  });

  if (tournament.metric === "DEPOSITS_POL" || tournament.metric === "DEPOSITS_USD") {
    registerTournamentMetricScorers();
    const scorer = getMetricScorer(tournament.metric);
    const scores = scorer
      ? await scorer.reconcile(
          { id: tournament.id, name: tournament.name, metric: tournament.metric, startsAt: tournament.startsAt, endsAt: tournament.endsAt, status: tournament.status as "ACTIVE" },
          { startsAt: tournament.startsAt, endsAt: upperBound },
        )
      : tournament.metric === "DEPOSITS_POL"
        ? await computeDepositScores(tournament.startsAt, upperBound)
        : new Map();
    const summary = scorer?.getAggregateSummary
      ? await scorer.getAggregateSummary(
          { id: tournament.id, name: tournament.name, metric: tournament.metric, startsAt: tournament.startsAt, endsAt: tournament.endsAt, status: tournament.status as "ACTIVE" },
          { startsAt: tournament.startsAt, endsAt: upperBound },
        )
      : tournament.metric === "DEPOSITS_POL"
        ? await aggregateDepositSummary(tournament.startsAt, upperBound)
        : null;
    const entries = stored.map(
      (
        e: {
          userId: number;
          score: number;
          rank: number | null;
          user: { id: number; username: string | null; name: string };
        },
        idx: number,
      ) => {
        const breakdown = scores.get(e.userId) ?? { total: 0, txCount: 0 };
        const storedScore = Number(e.score);
        return {
          rank: e.rank ?? idx + 1,
          userId: e.userId,
          username: e.user.username ?? e.user.name,
          storedScore,
          breakdown,
          mismatch: depositScoreMismatch(storedScore, breakdown.total, tournament.metric),
        };
      },
    );

    return {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        metric: tournament.metric,
        depositRankingUnit: depositRankingUnit(tournament.metric),
        status: tournament.status,
        startsAt: tournament.startsAt.toISOString(),
        endsAt: tournament.endsAt.toISOString(),
        windowUtc: formatUtcWindowLabel(tournament.startsAt, upperBound),
        upperBound: upperBound.toISOString(),
      },
      serverNow: now.toISOString(),
      serverNowUtc: formatUtcWindowLabel(now, now).start,
      depositSummary: summary
        ? normalizeDepositSummary(tournament.metric, summary as Record<string, unknown>)
        : null,
      entries,
    };
  }

  throw new Error("Unsupported audit metric");
}

export async function adminTournamentScoreAuditUser(tournamentId: number, userId: number) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return null;
  if (!isAuditableMetric(tournament.metric)) {
    throw new Error("Score audit is only available for deposit tournament metrics");
  }

  const upperBound = tournamentUpperBound(tournament);
  const stored = await prisma.tournamentEntry.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });

  if (tournament.metric === "DEPOSITS_POL" || tournament.metric === "DEPOSITS_USD") {
    registerTournamentMetricScorers();
    const scorer = getMetricScorer(tournament.metric);
    const detail = scorer?.getUserBreakdown
      ? await scorer.getUserBreakdown(
          userId,
          { id: tournament.id, name: tournament.name, metric: tournament.metric, startsAt: tournament.startsAt, endsAt: tournament.endsAt, status: tournament.status as "ACTIVE" },
          { startsAt: tournament.startsAt, endsAt: upperBound },
        )
      : await getDepositScoreDetailForUser(userId, tournament.startsAt, upperBound);
    const breakdownTotal = (detail as { breakdown?: { total: number } }).breakdown?.total ?? 0;
    const detailObj = detail as Record<string, unknown>;
    return {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        metric: tournament.metric,
        startsAt: tournament.startsAt.toISOString(),
        endsAt: tournament.endsAt.toISOString(),
        windowUtc: formatUtcWindowLabel(tournament.startsAt, upperBound),
        upperBound: upperBound.toISOString(),
      },
      serverNow: new Date().toISOString(),
      userId,
      storedScore: stored ? Number(stored.score) : null,
      ...detailObj,
      mismatch: stored ? depositScoreMismatch(Number(stored.score), breakdownTotal, tournament.metric) : false,
    };
  }

  throw new Error("Unsupported audit metric");
}

export async function getMyTournamentScoreBreakdown(tournamentId: number, userId: number) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament || !isAuditableMetric(tournament.metric)) return null;
  const upperBound = tournamentUpperBound(tournament);

  if (tournament.metric === "DEPOSITS_POL" || tournament.metric === "DEPOSITS_USD") {
    registerTournamentMetricScorers();
    const scorer = getMetricScorer(tournament.metric);
    const detail = scorer?.getUserBreakdown
      ? await scorer.getUserBreakdown(
          userId,
          { id: tournament.id, name: tournament.name, metric: tournament.metric, startsAt: tournament.startsAt, endsAt: tournament.endsAt, status: tournament.status as "ACTIVE" },
          { startsAt: tournament.startsAt, endsAt: upperBound },
        )
      : await getDepositScoreDetailForUser(userId, tournament.startsAt, upperBound);
    const detailObj = detail as Record<string, unknown>;
    return {
      tournamentId,
      metric: tournament.metric,
      windowUtc: formatUtcWindowLabel(tournament.startsAt, upperBound),
      ...detailObj,
    };
  }

  return null;
}
