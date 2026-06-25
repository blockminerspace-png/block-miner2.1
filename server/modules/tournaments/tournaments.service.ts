import _prisma from "../../src/db/prisma.js";
import { rankingUserSelect, aggregateUserHashrates } from "../../services/networkHashrateService.js";
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
    const rows = await prisma.transaction.groupBy({
      by: ["userId"],
      where: {
        type: "deposit",
        status: "completed",
        createdAt: { gte: startsAt, lte: upperBound},
      },
      _sum: { amount: true },
    });
    await batchUpsertEntries(
      tournament.id,
      rows
        .map((r) => ({ userId: r.userId, score: Number(r._sum.amount ?? 0) }))
        .filter((r) => r.score > 0),
    );
    return;
  }

  if (metric === "OFFERS_INTERNAL" || metric === "OFFERS_ALL") {
    const internal = await prisma.internalOfferwallAttempt.groupBy({
      by: ["userId"],
      where: { completedAt: { gte: startsAt, lte: upperBound} },
      _count: { id: true },
    });
    if (metric === "OFFERS_INTERNAL") {
      await batchUpsertEntries(
        tournament.id,
        internal.map((r) => ({ userId: r.userId, score: r._count.id })),
      );
      return;
    }
    // OFFERS_ALL: also pull external offerwall below and merge.
    // NB: zerads_ptc_callbacks is PTC (pay-to-click), not offerwall — excluded.
    const ome = await prisma.offerwallMeCallback.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: startsAt, lte: upperBound }, status: 1 },
      _count: { id: true },
    });
    const merged = new Map<number, number>();
    for (const r of internal) merged.set(r.userId, (merged.get(r.userId) ?? 0) + r._count.id);
    for (const r of ome) merged.set(r.userId, (merged.get(r.userId) ?? 0) + r._count.id);
    await batchUpsertEntries(
      tournament.id,
      Array.from(merged.entries()).map(([userId, score]) => ({ userId, score })),
    );
    return;
  }

  if (metric === "OFFERS_EXTERNAL") {
    // NB: zerads_ptc_callbacks é PTC (pay-to-click), não offerwall — excluído.
    const ome = await prisma.offerwallMeCallback.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: startsAt, lte: upperBound }, status: 1 },
      _count: { id: true },
    });
    await batchUpsertEntries(
      tournament.id,
      ome.map((r: { userId: number; _count: { id: number } }) => ({ userId: r.userId, score: r._count.id })),
    );
    return;
  }
}

async function batchUpsertEntries(
  tournamentId: number,
  rows: { userId: number; score: number }[],
): Promise<void> {
  if (rows.length === 0) return;
  // Use chunks of 100 to avoid overwhelming Prisma
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
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
}

// ─── Finalization ───────────────────────────────────────────────────────────

// Início do "dia" no horário do servidor (UTC): 00:00 UTC = 21:00 BRT.
function serverDayStart(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Janela canônica do ciclo para um determinado tipo, contendo `anchor`.
 * O servidor usa UTC, então "dia" começa 00:00 UTC (21:00 BRT).
 *  - DAILY:   00:00 UTC do dia de `anchor` → +24h
 *  - WEEKLY:  segunda 00:00 UTC da semana de `anchor` → +7d
 *  - MONTHLY: dia 1 00:00 UTC do mês de `anchor` → dia 1 do mês seguinte
 *  - outros:  null (sem snap)
 */
export function snapWindowForType(
  type: string | undefined,
  anchor: Date,
): { start: Date; end: Date } | null {
  if (type === "DAILY") {
    const start = serverDayStart(anchor);
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
  }
  if (type === "WEEKLY") {
    // Início = segunda 21:00 BRT = terça 00:00 UTC. Semana = ter→ter no UTC.
    const today = serverDayStart(anchor);
    const dow = today.getUTCDay(); // 0=dom, 1=seg, 2=ter
    const daysSinceTuesday = (dow + 5) % 7; // ter=0, qua=1, ..., seg=6
    const start = new Date(today.getTime() - daysSinceTuesday * 24 * 60 * 60 * 1000);
    return { start, end: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000) };
  }
  if (type === "MONTHLY") {
    // Início = dia 1 às 21:00 BRT = dia 2 00:00 UTC.
    // Janela que contém `anchor`: se anchor < dia 2 00:00 UTC do seu mês, pertence ao mês anterior.
    const d = serverDayStart(anchor);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const thisMonthStart = Date.UTC(y, m, 2, 0, 0, 0, 0);
    const startMs = anchor.getTime() < thisMonthStart
      ? Date.UTC(y, m - 1, 2, 0, 0, 0, 0)
      : thisMonthStart;
    const start = new Date(startMs);
    const sy = start.getUTCFullYear();
    const sm = start.getUTCMonth();
    const end = new Date(Date.UTC(sy, sm + 1, 2, 0, 0, 0, 0));
    return { start, end };
  }
  return null;
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
  if (start <= prevEnd) {
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

  // Final score update before ranking
  await computeScoresForTournament(tournament);

  const entries = await prisma.tournamentEntry.findMany({
    where: { tournamentId },
    orderBy: { score: "desc" },
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
    } catch (err) {
      console.error(`[tournaments] failed to spawn next cycle for #${tournamentId}:`, err);
    }
  }

  return { ranked: entries.length, rewarded, nextId };
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
    for (let k = 0; k < (prize.minerCount ?? 1); k++) {
      await tx.userRewardInbox.create({
        data: {
          userId,
          source,
          status: "pending",
          rewardType: "machine",
          rewardValue: 0,
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
  return sortByTypeOrder(rows, order);
}

export async function getTournamentWithLeaderboard(tournamentId: number, userId?: number) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      prizes: { orderBy: { rankFrom: "asc" }, include: { miner: { select: { id: true, name: true, imageUrl: true, baseHashRate: true } } } },
      _count: { select: { entries: true } },
    },
  });
  if (!tournament) return null;

  const top = await prisma.tournamentEntry.findMany({
    where: { tournamentId },
    orderBy: { score: "desc" },
    take: LEADERBOARD_LIMIT,
    include: {
      user: {
        select: { id: true, username: true, name: true },
      },
    },
  });

  let myEntry: TournamentEntry | null = null;
  let myRankLive: number | null = null;
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
  }

  return { tournament, top, myEntry, myRankLive };
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
  metric: "HASHRATE" | "BLOCKS_MINED" | "CHECKINS" | "TASKS_COMPLETED" | "DEPOSITS_POL" | "OFFERS_INTERNAL" | "OFFERS_EXTERNAL" | "OFFERS_ALL";
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

  return prisma.tournament.create({
    data: {
      name: data.name,
      description: data.description,
      type: data.type,
      metric: data.metric,
      startsAt,
      endsAt,
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
}

export async function adminUpdateTournament(
  tournamentId: number,
  data: {
    name?: string;
    description?: string | null;
    type?: "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
    metric?: "HASHRATE" | "BLOCKS_MINED" | "CHECKINS" | "TASKS_COMPLETED" | "DEPOSITS_POL" | "OFFERS_INTERNAL" | "OFFERS_EXTERNAL" | "OFFERS_ALL";
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
  });
}

export async function adminCancelTournament(tournamentId: number) {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!t) throw new Error("Tournament not found");
  if (t.status === "ENDED") throw new Error("Cannot cancel an ended tournament");
  return prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "CANCELLED" },
  });
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
