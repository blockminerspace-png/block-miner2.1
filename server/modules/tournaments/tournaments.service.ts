import _prisma from "../../src/db/prisma.js";
import { rankingUserSelect, aggregateUserHashrates } from "../../services/networkHashrateService.js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

type Tournament = { id: number; name: string; metric: string; startsAt: Date; status: string; prizes?: any[] };
type TournamentEntry = { id: number; tournamentId: number; userId: number; score: number; rank: number | null; rewardGranted: boolean; rewardGrantedAt: Date | null; createdAt: Date; updatedAt: Date };
type TournamentPrize = { id: number; tournamentId: number; rankFrom: number; rankTo: number; prizeType: string; polAmount: number | null; blkAmount: number | null; boostHashRate: number | null; boostHours: number | null; minerId: number | null; minerCount: number | null };

export const LEADERBOARD_LIMIT = 100;

// ─── Score computation ──────────────────────────────────────────────────────

export async function computeScoresForTournament(tournament: Tournament): Promise<void> {
  const now = new Date();
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
      where: { createdAt: { gte: startsAt, lte: now } },
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
          { confirmedAt: { gte: startsAt, lte: now } },
          { createdAt: { gte: startsAt, lte: now }, status: "confirmed" },
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
      where: { completedAt: { gte: startsAt, lte: now } },
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
        createdAt: { gte: startsAt, lte: now },
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
      const newStart = tournament.endsAt;
      const newEnd = new Date(newStart.getTime() + duration);
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

export async function listActiveTournaments() {
  return prisma.tournament.findMany({
    where: {
      status: { in: ["ACTIVE", "SCHEDULED"] },
    },
    include: {
      prizes: { orderBy: { rankFrom: "asc" } },
      _count: { select: { entries: true } },
    },
    orderBy: { startsAt: "asc" },
  });
}

export async function getTournamentWithLeaderboard(tournamentId: number, userId?: number) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      prizes: { orderBy: { rankFrom: "asc" } },
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
        select: { id: true, username: true, name: true, avatarUrl: true },
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
  return prisma.tournament.findMany({
    include: {
      prizes: { orderBy: { rankFrom: "asc" } },
      _count: { select: { entries: true } },
    },
    orderBy: { startsAt: "desc" },
  });
}

export async function adminCreateTournament(data: {
  name: string;
  description?: string;
  type: "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
  metric: "HASHRATE" | "BLOCKS_MINED" | "CHECKINS" | "TASKS_COMPLETED" | "DEPOSITS_POL";
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
  return prisma.tournament.create({
    data: {
      name: data.name,
      description: data.description,
      type: data.type,
      metric: data.metric,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
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
