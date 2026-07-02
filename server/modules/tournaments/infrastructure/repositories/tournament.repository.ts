import _prisma from "../../../../src/db/prisma.js";
import type { ContributionDelta, TournamentMetric, TournamentRecord } from "../../domain/types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaTx = any;

export async function findActiveTournamentsByMetrics(
  metrics: TournamentMetric[],
): Promise<TournamentRecord[]> {
  return prisma.tournament.findMany({
    where: { status: "ACTIVE", metric: { in: metrics } },
    select: {
      id: true,
      name: true,
      metric: true,
      startsAt: true,
      endsAt: true,
      status: true,
    },
  });
}

export async function findTournamentById(tournamentId: number): Promise<TournamentRecord | null> {
  return prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true,
      name: true,
      metric: true,
      startsAt: true,
      endsAt: true,
      status: true,
    },
  });
}

export async function findActiveTournaments(): Promise<TournamentRecord[]> {
  return prisma.tournament.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      metric: true,
      startsAt: true,
      endsAt: true,
      status: true,
    },
  });
}

export async function touchScoresReconciledAt(tournamentId: number): Promise<void> {
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { scoresReconciledAt: new Date() },
  });
}

export type InsertContributionResult = "inserted" | "duplicate";

export async function insertContributionIdempotent(
  tournamentId: number,
  delta: ContributionDelta,
  tx?: PrismaTx,
): Promise<InsertContributionResult> {
  const client = tx ?? prisma;
  try {
    await client.tournamentScoreContribution.create({
      data: {
        tournamentId,
        userId: delta.userId,
        sourceType: delta.sourceType,
        sourceId: delta.sourceId,
        metricValue: delta.metricValue.toString(),
        eventAt: delta.eventAt,
        metadata: delta.metadata ?? undefined,
      },
    });
    return "inserted";
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") return "duplicate";
    throw err;
  }
}

export async function applyScoreDelta(
  tournamentId: number,
  userId: number,
  delta: number,
  eventAt: Date,
  tx?: PrismaTx,
): Promise<void> {
  const client = tx ?? prisma;
  const existing = await client.tournamentEntry.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
  });

  if (existing) {
    await client.tournamentEntry.update({
      where: { id: existing.id },
      data: {
        score: { increment: delta },
        firstContributionAt: existing.firstContributionAt ?? eventAt,
      },
    });
    return;
  }

  try {
    await client.tournamentEntry.create({
      data: {
        tournamentId,
        userId,
        score: delta,
        firstContributionAt: eventAt,
      },
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== "P2002") throw err;
    await client.tournamentEntry.update({
      where: { tournamentId_userId: { tournamentId, userId } },
      data: {
        score: { increment: delta },
        firstContributionAt: eventAt,
      },
    });
  }
}

export async function batchUpsertEntriesFromReconcile(
  tournamentId: number,
  rows: { userId: number; score: number }[],
): Promise<void> {
  const active = rows.filter((r) => r.score > 0);
  const activeIds = active.map((r) => r.userId);

  if (activeIds.length === 0) {
    await prisma.tournamentEntry.deleteMany({ where: { tournamentId } });
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
}

export async function getEntryScores(
  tournamentId: number,
): Promise<Map<number, number>> {
  const entries = await prisma.tournamentEntry.findMany({
    where: { tournamentId },
    select: { userId: true, score: true },
  });
  const map = new Map<number, number>();
  for (const e of entries) map.set(e.userId, Number(e.score));
  return map;
}
