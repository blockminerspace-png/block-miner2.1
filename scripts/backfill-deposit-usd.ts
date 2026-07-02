#!/usr/bin/env node
/**
 * Backfill immutable USD valuation for completed POL deposits missing usd_value_at_confirmation.
 *
 * Usage:
 *   node --import tsx scripts/backfill-deposit-usd.ts [--limit=100] [--dry-run]
 */

import prisma from "../server/src/db/prisma.js";
import { parseDepositBlock, parseDepositSource } from "../server/modules/tournaments/depositTournamentScore.js";
import { valueDepositAtConfirmation } from "../server/modules/tournaments/infrastructure/deposit/deposit-valuation.service.js";
import { getSharedPolygonProvider } from "../server/services/polygonProvider.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Math.max(1, parseInt(limitArg.split("=")[1] ?? "100", 10)) : 100;
const DELAY_MS = 1200;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function resolveEventAt(row: {
  confirmedEventAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  rawTx: string | null;
}): Promise<Date> {
  if (row.confirmedEventAt) return row.confirmedEventAt;
  const block = parseDepositBlock(row.rawTx);
  if (block != null) {
    try {
      const provider = getSharedPolygonProvider();
      const b = await provider.getBlock(block);
      if (b?.timestamp) return new Date(Number(b.timestamp) * 1000);
    } catch { /* fallback */ }
  }
  return row.completedAt ?? row.createdAt;
}

async function main(): Promise<void> {
  const rows = await prisma.transaction.findMany({
    where: {
      type: "deposit",
      status: "completed",
      usdValueAtConfirmation: null,
    },
    orderBy: { id: "asc" },
    take: LIMIT,
    select: {
      id: true,
      amount: true,
      rawTx: true,
      completedAt: true,
      createdAt: true,
      confirmedEventAt: true,
    },
  });

  console.info(`[backfill-deposit-usd] found ${rows.length} deposits to process (dryRun=${dryRun})`);

  let ok = 0;
  let fail = 0;

  for (const row of rows) {
    const polAmount = Number(row.amount);
    const source = parseDepositSource(row.rawTx) ?? "treasury";
    const block = parseDepositBlock(row.rawTx);

    try {
      let valuation: Awaited<ReturnType<typeof valueDepositAtConfirmation>>;
      if (block != null) {
        valuation = await valueDepositAtConfirmation({
          polAmount,
          blockNumber: block,
          source,
        });
      } else {
        const eventAt = await resolveEventAt(row);
        const { resolveAndPersistPrice, computeUsdValue } = await import(
          "../server/modules/pricing/index.js"
        );
        const snapshot = await resolveAndPersistPrice("POL", eventAt);
        valuation = {
          confirmedEventAt: eventAt,
          usdRate: snapshot.priceUsd,
          usdValue: computeUsdValue(polAmount, snapshot.priceUsd),
          priceSnapshotId: snapshot.id,
          countsForTournament: source !== "hd_deposit",
        };
      }

      if (!dryRun) {
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
      }

      ok++;
      console.info(`[backfill] #${row.id} POL=${polAmount} USD=${valuation.usdValue}`);
    } catch (err) {
      fail++;
      console.error(`[backfill] #${row.id} failed:`, err instanceof Error ? err.message : String(err));
    }

    await sleep(DELAY_MS);
  }

  console.info(`[backfill-deposit-usd] done ok=${ok} fail=${fail}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
