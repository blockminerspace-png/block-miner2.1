/**
 * One-shot prod fix: backfill USD on completed deposits + reconcile deposit tournament.
 * Run inside app container: node scripts/vm-prod-fix-deposit-usd.mjs [tournamentId]
 */
import prisma from "../dist/server/src/db/prisma.js";
import {
  parseDepositBlock,
  parseDepositSource,
} from "../dist/server/modules/tournaments/depositTournamentScore.js";
import { valueDepositAtConfirmation } from "../dist/server/modules/tournaments/infrastructure/deposit/deposit-valuation.service.js";
import { resolveAndPersistPrice, computeUsdValue } from "../dist/server/modules/pricing/index.js";
import { getSharedPolygonProvider } from "../dist/server/services/polygonProvider.js";
import { registerTournamentMetricScorers } from "../dist/server/modules/tournaments/domain/metrics/register-scorers.js";
import { reconcileTournament } from "../dist/server/modules/tournaments/application/tournament-engine.js";
import { invalidateLeaderboardCache } from "../dist/server/modules/tournaments/infrastructure/cache/leaderboard.cache.js";

const TOURNAMENT_ID = Number(process.argv[2] || 10);
const DELAY_MS = 1200;

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

async function backfillDeposits() {
  const rows = await prisma.transaction.findMany({
    where: { type: "deposit", status: "completed", usdValueAtConfirmation: null },
    orderBy: { id: "asc" },
    take: 500,
    select: {
      id: true,
      amount: true,
      rawTx: true,
      completedAt: true,
      createdAt: true,
      confirmedEventAt: true,
    },
  });

  console.info(`[fix] backfilling ${rows.length} deposit(s)`);
  let ok = 0;
  let fail = 0;

  for (const row of rows) {
    const polAmount = Number(row.amount);
    const source = parseDepositSource(row.rawTx) ?? "treasury";
    const block = parseDepositBlock(row.rawTx);
    try {
      let valuation;
      if (block != null) {
        valuation = await valueDepositAtConfirmation({
          polAmount,
          blockNumber: block,
          source,
        });
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
      console.info(`[fix] tx #${row.id} POL=${polAmount} USD=${valuation.usdValue}`);
    } catch (err) {
      fail++;
      console.error(`[fix] tx #${row.id} failed:`, err instanceof Error ? err.message : String(err));
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.info(`[fix] backfill done ok=${ok} fail=${fail}`);
}

async function reconcileDepositTournament() {
  registerTournamentMetricScorers();
  const report = await reconcileTournament(TOURNAMENT_ID);
  await invalidateLeaderboardCache(TOURNAMENT_ID);
  console.info(`[fix] reconcile tournament #${TOURNAMENT_ID}:`, JSON.stringify(report));
}

async function main() {
  await backfillDeposits();
  await reconcileDepositTournament();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
