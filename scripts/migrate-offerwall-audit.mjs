/**
 * READ-ONLY audit: legacy batch expected scores vs tournament_entries (production migration prep).
 * Run inside app container: node scripts/migrate-offerwall-audit.mjs
 */
import _prisma from "../dist/server/src/db/prisma.js";
import { computeOfferwallScores } from "../dist/server/modules/tournaments/offerwallTournamentScore.js";

const prisma = _prisma;
const now = new Date();

const tournaments = await prisma.tournament.findMany({
  where: {
    status: "ACTIVE",
    metric: { in: ["OFFERS_INTERNAL", "OFFERS_EXTERNAL", "OFFERS_ALL"] },
  },
  orderBy: { id: "asc" },
});

const globalActions = await prisma.tournamentAction.count();
const globalContribs = await prisma.tournamentScoreContribution.count();

const report = {
  auditedAt: now.toISOString(),
  global: { tournamentActions: globalActions, contributions: globalContribs },
  tournaments: [],
};

for (const t of tournaments) {
  const upper = t.endsAt < now ? t.endsAt : now;
  const includeInternal = t.metric !== "OFFERS_EXTERNAL";
  const legacy = await computeOfferwallScores(t.startsAt, upper, { includeInternal });

  const entries = await prisma.tournamentEntry.findMany({
    where: { tournamentId: t.id },
    select: { userId: true, score: true },
  });

  const contribs = await prisma.tournamentScoreContribution.groupBy({
    by: ["userId"],
    where: { tournamentId: t.id },
    _sum: { metricValue: true },
  });
  const contribMap = new Map(
    contribs.map((r) => [r.userId, Number(r._sum.metricValue ?? 0)]),
  );

  const entryMap = new Map(entries.map((e) => [e.userId, Number(e.score)]));
  const allUsers = new Set([...entryMap.keys(), ...legacy.keys(), ...contribMap.keys()]);

  let matchEntryLegacy = 0;
  let matchEntryContrib = 0;
  const mismatches = [];

  for (const userId of allUsers) {
    const entry = entryMap.get(userId) ?? 0;
    const leg = legacy.get(userId)?.total ?? 0;
    const contrib = contribMap.get(userId) ?? 0;
    if (entry === leg && entry > 0) matchEntryLegacy++;
    if (entry === contrib && entry > 0) matchEntryContrib++;
    if (entry !== leg || entry !== contrib) {
      if (mismatches.length < 25) {
        mismatches.push({ userId, entry, legacyExpected: leg, contribSum: contrib });
      }
    }
  }

  const sorted = [...entries].sort((a, b) => Number(b.score) - Number(a.score));
  const leader = sorted[0];

  report.tournaments.push({
    id: t.id,
    name: t.name,
    type: t.type,
    metric: t.metric,
    window: {
      startsAt: t.startsAt.toISOString(),
      endsAt: t.endsAt.toISOString(),
      upperBound: upper.toISOString(),
    },
    counts: {
      entries: entries.filter((e) => Number(e.score) > 0).length,
      entriesTotal: entries.length,
      contributions: contribs.length,
      driftAlerts: await prisma.tournamentScoreDrift.count({ where: { tournamentId: t.id } }),
    },
    compare: {
      usersWithLegacyScore: legacy.size,
      matchEntryVsLegacy: matchEntryLegacy,
      matchEntryVsContrib: matchEntryContrib,
      mismatchUsers: allUsers.size - matchEntryLegacy,
      sampleMismatches: mismatches,
    },
    leader: leader
      ? {
          userId: leader.userId,
          entry: Number(leader.score),
          legacyExpected: legacy.get(leader.userId)?.total ?? 0,
          contribSum: contribMap.get(leader.userId) ?? 0,
        }
      : null,
    metricConfig: t.metricConfig ?? null,
  });
}

console.log(JSON.stringify(report, null, 2));
await prisma.$disconnect();
