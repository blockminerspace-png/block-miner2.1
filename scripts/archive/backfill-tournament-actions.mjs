t/**
 * @deprecated Use migrate-offerwall-run.mjs (global backfill, not per-tournament).
 *
 *   node scripts/migrate-offerwall-run.mjs backfill
 */
import _prisma from "../dist/server/src/db/prisma.js";

const prisma = _prisma;

const PROVIDER = {
  INTERNAL: "internal",
  OFFERWALLME: "offerwallme",
  ZERADS: "zerads",
};

async function upsertAction(row) {
  try {
    await prisma.tournamentAction.create({ data: row });
    return "inserted";
  } catch (e) {
    if (e?.code === "P2002") return "skipped";
    throw e;
  }
}

async function main() {
  const now = new Date();
  const tournaments = await prisma.tournament.findMany({
    where: {
      status: { in: ["ACTIVE", "ENDED"] },
      metric: { in: ["OFFERS_INTERNAL", "OFFERS_EXTERNAL", "OFFERS_ALL"] },
      endsAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
    },
  });

  let inserted = 0;
  let skipped = 0;
  for (const t of tournaments) {
    const upper = t.endsAt < now ? t.endsAt : now;
    const metrics = {
      internal: t.metric !== "OFFERS_EXTERNAL",
      offerwallMe: t.metric !== "OFFERS_INTERNAL",
      zerads: t.metric !== "OFFERS_INTERNAL",
    };

    if (metrics.internal) {
      const rows = await prisma.internalOfferwallAttempt.findMany({
        where: {
          status: "COMPLETED",
          completedAt: { gte: t.startsAt, lte: upper },
        },
        select: { id: true, userId: true, completedAt: true, offerId: true },
      });
      for (const r of rows) {
        const result = await upsertAction({
          userId: r.userId,
          provider: PROVIDER.INTERNAL,
          actionCount: 1,
          executedAtUTC: r.completedAt,
          sourceId: String(r.id),
          metadata: { offerId: r.offerId, backfill: true, timestampSource: "completed_at" },
        });
        if (result === "inserted") inserted++;
        else skipped++;
      }
    }

    if (metrics.offerwallMe) {
      const rows = await prisma.offerwallMeCallback.findMany({
        where: {
          status: 1,
          createdAt: { gte: t.startsAt, lte: upper },
        },
        select: { transId: true, userId: true, createdAt: true },
      });
      for (const r of rows) {
        const result = await upsertAction({
          userId: r.userId,
          provider: PROVIDER.OFFERWALLME,
          actionCount: 1,
          executedAtUTC: r.createdAt,
          sourceId: r.transId,
          metadata: { backfill: true, timestampSource: "db_created_at" },
        });
        if (result === "inserted") inserted++;
        else skipped++;
      }
    }

    if (metrics.zerads) {
      const rows = await prisma.zeradsCallback.findMany({
        where: {
          callbackAt: { gte: t.startsAt, lte: upper },
        },
        select: { callbackHash: true, userId: true, callbackAt: true, clicks: true },
      });
      for (const r of rows) {
        const clicks = Math.trunc(Number(r.clicks) || 0);
        if (clicks <= 0) continue;
        const result = await upsertAction({
          userId: r.userId,
          provider: PROVIDER.ZERADS,
          actionCount: clicks,
          executedAtUTC: r.callbackAt,
          sourceId: r.callbackHash,
          metadata: { backfill: true, timestampSource: "callback_at" },
        });
        if (result === "inserted") inserted++;
        else skipped++;
      }
    }
  }

  console.log(JSON.stringify({
    event: "tournament.backfill.completed",
    inserted,
    skipped,
    tournaments: tournaments.length,
  }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
