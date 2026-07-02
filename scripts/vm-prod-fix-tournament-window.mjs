/**
 * Backfill USD only for deposits in an active deposit tournament window, then reconcile.
 * docker exec block-miner-app node /app/scripts/vm-prod-fix-tournament-window.mjs <tournamentId>
 */
import prisma from "../dist/server/src/db/prisma.js";
import {
  parseDepositBlock,
  parseDepositSource,
  countsForDepositTournament,
} from "../dist/server/modules/tournaments/depositTournamentScore.js";
import { valueDepositAtConfirmation } from "../dist/server/modules/tournaments/infrastructure/deposit/deposit-valuation.service.js";
import { resolveAndPersistPrice, computeUsdValue } from "../dist/server/modules/pricing/index.js";
import { getSharedPolygonProvider } from "../dist/server/services/polygonProvider.js";
import { registerTournamentMetricScorers } from "../dist/server/modules/tournaments/domain/metrics/register-scorers.js";
import { reconcileTournament } from "../dist/server/modules/tournaments/application/tournament-engine.js";
import { invalidateLeaderboardCache } from "../dist/server/modules/tournaments/infrastructure/cache/leaderboard.cache.js";

const TOURNAMENT_ID = Number(process.argv[2] || 10);
const DELAY_MS = 3500;

async function resolveEventAt(row) {
  if (row.confirmedEventAt) return row.confirmedEventAt;
  const block = parseDepositBlock(row.rawTx);
  if (block != null) {
    try {
      const provider = getSharedPolygonProvider();
      const b = await provider.getBlock(block);
      if (b?.timestamp) return new Date(Number(b.timestamp) * 1000);
    } catch {
      /* fallback */
    }
  }
  return row.completedAt ?? row.createdAt;
}

async function main() {
  const tournament = await prisma.tournament.findUnique({ where: { id: TOURNAMENT_ID } });
  if (!tournament) throw new Error(`Tournament #${TOURNAMENT_ID} not found`);

  const now = new Date();
  const upperBound = tournament.endsAt < now ? tournament.endsAt : now;

  const rows = await prisma.transaction.findMany({
    where: {
      type: "deposit",
      status: "completed",
      OR: [
        { completedAt: { gte: tournament.startsAt, lte: upperBound } },
        { completedAt: null, createdAt: { gte: tournament.startsAt, lte: upperBound } },
      ],
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      amount: true,
      rawTx: true,
      completedAt: true,
      createdAt: true,
      confirmedEventAt: true,
      usdValueAtConfirmation: true,
    },
  });

  const eligible = rows.filter((r) => countsForDepositTournament(r.rawTx));
  console.info(`[tournament-fix] #${TOURNAMENT_ID} metric=${tournament.metric} eligible=${eligible.length}`);

  let ok = 0;
  for (const row of eligible) {
    if (row.usdValueAtConfirmation != null) {
      console.info(`[tournament-fix] skip #${row.id} already has USD`);
      continue;
    }
    const polAmount = Number(row.amount);
    const source = parseDepositSource(row.rawTx) ?? "treasury";
    const block = parseDepositBlock(row.rawTx);
    try {
      let valuation;
      if (block != null) {
        valuation = await valueDepositAtConfirmation({ polAmount, blockNumber: block, source });
      } else {
        const eventAt = await resolveEventAt(row);
        const snapshot = await resolveAndPersistPrice("POL", eventAt);
        valuation = {
          confirmedEventAt: eventAt,
          usdRate: snapshot.priceUsd,
          usdValue: computeUsdValue(polAmount, snapshot.priceUsd),
          priceSnapshotId: snapshot.id,
          countsForTournament: source !== "hd_deposit",
        };
      }
      await prisma.transaction.update({
        where: { id: row.id },
        data: {
          confirmedEventAt: valuation.confirmedEventAt,
          usdRateAtConfirmation: valuation.usdRate.toString(),
          usdValueAtConfirmation: valuation.usdValue.toString(),
          countsForTournament: valuation.countsForTournament,
          priceSnapshotId: valuation.priceSnapshotId,
        },
      });
      ok++;
      console.info(`[tournament-fix] tx #${row.id} POL=${polAmount} USD=${valuation.usdValue}`);
    } catch (err) {
      console.error(`[tournament-fix] tx #${row.id} failed:`, err instanceof Error ? err.message : String(err));
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.info(`[tournament-fix] backfilled ${ok} tx(s)`);

  if (tournament.metric !== "DEPOSITS_USD") {
    await prisma.tournament.update({
      where: { id: TOURNAMENT_ID },
      data: { metric: "DEPOSITS_USD" },
    });
    console.info("[tournament-fix] metric set to DEPOSITS_USD");
  }

  registerTournamentMetricScorers();
  const report = await reconcileTournament(TOURNAMENT_ID);
  await invalidateLeaderboardCache(TOURNAMENT_ID);
  console.info("[tournament-fix] reconcile:", JSON.stringify(report));

  const top = await prisma.tournamentEntry.findMany({
    where: { tournamentId: TOURNAMENT_ID },
    orderBy: { score: "desc" },
    take: 5,
    include: { user: { select: { username: true } } },
  });
  for (const e of top) {
    console.info(`  ${e.user.username}: score=${e.score}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
