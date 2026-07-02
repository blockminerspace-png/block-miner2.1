/**
 * Shared offerwall migration helpers (global backfill + per-tournament projection).
 */
import { createHash } from "node:crypto";
import _prisma from "../../dist/server/src/db/prisma.js";
import { TOURNAMENT_ACTION_PROVIDER } from "../../dist/server/modules/tournaments/domain/tournament-action.providers.js";
import { providerAllowedForMetric } from "../../dist/server/modules/tournaments/domain/tournament-action.providers.js";
import { windowContains } from "../../dist/server/modules/tournaments/domain/types.js";
import { tournamentActionOutboxPayload } from "../../dist/server/modules/tournaments/domain/events/tournament-action.event.js";
import { OffersMetricScorer } from "../../dist/server/modules/tournaments/domain/metrics/offerwall.scorer.js";
import { computeOfferwallScores } from "../../dist/server/modules/tournaments/offerwallTournamentScore.js";
import { insertContributionIdempotent } from "../../dist/server/modules/tournaments/infrastructure/repositories/tournament.repository.js";
import {
  capZeradsClicksForUtcDay,
  utcDayKey,
} from "../../dist/server/modules/zerads/zeradsClickLimits.js";

export const prisma = _prisma;
export const OFFERWALL_METRICS = ["OFFERS_INTERNAL", "OFFERS_EXTERNAL", "OFFERS_ALL"];

export function upperBound(tournament, now = new Date()) {
  return tournament.endsAt < now ? tournament.endsAt : now;
}

export async function loadActiveOfferwallTournaments() {
  return prisma.tournament.findMany({
    where: { status: "ACTIVE", metric: { in: OFFERWALL_METRICS } },
    orderBy: { id: "asc" },
  });
}

export function scanRange(tournaments, now = new Date()) {
  if (tournaments.length === 0) return null;
  let start = tournaments[0].startsAt;
  let end = upperBound(tournaments[0], now);
  for (const t of tournaments) {
    if (t.startsAt < start) start = t.startsAt;
    const u = upperBound(t, now);
    if (u > end) end = u;
  }
  return { start, end };
}

/** True if this provider event counts toward at least one active offerwall tournament window. */
export function qualifiesForAnyTournament(provider, executedAt, tournaments, now = new Date()) {
  for (const t of tournaments) {
    if (!providerAllowedForMetric(provider, t.metric)) continue;
    if (windowContains(t, executedAt, upperBound(t, now))) return true;
  }
  return false;
}

async function upsertAction(row) {
  try {
    await prisma.tournamentAction.create({ data: row });
    return "inserted";
  } catch (e) {
    if (e?.code === "P2002") {
      // Re-backfill: update actionCount if zerads cap distribution changed.
      if (row.metadata?.backfill) {
        await prisma.tournamentAction.updateMany({
          where: { provider: row.provider, sourceId: row.sourceId },
          data: {
            actionCount: row.actionCount,
            executedAtUTC: row.executedAtUTC,
            metadata: row.metadata,
          },
        });
        return "updated";
      }
      return "skipped";
    }
    throw e;
  }
}

/**
 * Phase B — single global backfill. TournamentAction exists once per provider event.
 */
export async function runGlobalBackfill(now = new Date()) {
  const tournaments = await loadActiveOfferwallTournaments();
  if (tournaments.length === 0) {
    return { inserted: 0, skipped: 0, message: "no active offerwall tournaments" };
  }

  const range = scanRange(tournaments, now);
  let inserted = 0;
  let skipped = 0;
  let updated = 0;

  const internalRows = await prisma.internalOfferwallAttempt.findMany({
    where: {
      status: "COMPLETED",
      completedAt: { gte: range.start, lte: range.end },
    },
    select: { id: true, userId: true, completedAt: true, offerId: true },
  });
  for (const r of internalRows) {
    if (
      !qualifiesForAnyTournament(
        TOURNAMENT_ACTION_PROVIDER.INTERNAL,
        r.completedAt,
        tournaments,
        now,
      )
    ) {
      continue;
    }
    const result = await upsertAction({
      userId: r.userId,
      provider: TOURNAMENT_ACTION_PROVIDER.INTERNAL,
      actionCount: 1,
      executedAtUTC: r.completedAt,
      sourceId: String(r.id),
      tournamentEligible: true,
      metadata: { offerId: r.offerId, backfill: true, timestampSource: "completed_at" },
    });
    if (result === "inserted") inserted++;
    else if (result === "updated") updated++;
    else skipped++;
  }

  const owmRows = await prisma.offerwallMeCallback.findMany({
    where: {
      status: 1,
      createdAt: { gte: range.start, lte: range.end },
    },
    select: { transId: true, userId: true, createdAt: true },
  });
  for (const r of owmRows) {
    if (
      !qualifiesForAnyTournament(
        TOURNAMENT_ACTION_PROVIDER.OFFERWALLME,
        r.createdAt,
        tournaments,
        now,
      )
    ) {
      continue;
    }
    const result = await upsertAction({
      userId: r.userId,
      provider: TOURNAMENT_ACTION_PROVIDER.OFFERWALLME,
      actionCount: 1,
      executedAtUTC: r.createdAt,
      sourceId: r.transId,
      tournamentEligible: true,
      metadata: { backfill: true, timestampSource: "db_created_at" },
    });
    if (result === "inserted") inserted++;
    else if (result === "updated") updated++;
    else skipped++;
  }

  const zeradsRows = await prisma.zeradsCallback.findMany({
    where: {
      callbackAt: { gte: range.start, lte: range.end },
    },
    select: { callbackHash: true, userId: true, callbackAt: true, clicks: true },
    orderBy: { callbackAt: "asc" },
  });

  /** Legacy caps Zerads per UTC day on the sum of clicks — match that when backfilling. */
  const zeradsByUserDay = new Map();
  for (const r of zeradsRows) {
    const clicks = Math.trunc(Number(r.clicks) || 0);
    if (clicks <= 0) continue;
    const day = utcDayKey(r.callbackAt);
    const key = `${r.userId}|${day}`;
    if (!zeradsByUserDay.has(key)) zeradsByUserDay.set(key, []);
    zeradsByUserDay.get(key).push({ ...r, clicks });
  }

  for (const [, dayRows] of zeradsByUserDay) {
    const dayTotal = dayRows.reduce((s, r) => s + r.clicks, 0);
    const dayCredited = capZeradsClicksForUtcDay(dayTotal);
    let assigned = 0;
    for (let i = 0; i < dayRows.length; i++) {
      const r = dayRows[i];
      let actionCount;
      if (i === dayRows.length - 1) {
        actionCount = dayCredited - assigned;
      } else {
        actionCount = dayTotal > 0 ? Math.floor((r.clicks / dayTotal) * dayCredited) : 0;
        assigned += actionCount;
      }
      if (actionCount <= 0) continue;
      if (
        !qualifiesForAnyTournament(TOURNAMENT_ACTION_PROVIDER.ZERADS, r.callbackAt, tournaments, now)
      ) {
        continue;
      }
      const result = await upsertAction({
        userId: r.userId,
        provider: TOURNAMENT_ACTION_PROVIDER.ZERADS,
        actionCount,
        executedAtUTC: r.callbackAt,
        sourceId: r.callbackHash,
        tournamentEligible: true,
        metadata: {
          backfill: true,
          timestampSource: "callback_at",
          zeradsDayCredited: dayCredited,
          zeradsDayRaw: dayTotal,
        },
      });
      if (result === "inserted") inserted++;
      else if (result === "updated") updated++;
      else skipped++;
    }
  }

  await prisma.tournamentOfferwallMigrationGlobal.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      globalBackfillAt: now,
      globalBackfillActions: inserted,
      globalBackfillSkipped: skipped,
    },
    update: {
      globalBackfillAt: now,
      globalBackfillActions: { increment: inserted },
      globalBackfillSkipped: { increment: skipped },
    },
  });

  return { inserted, skipped, updated, range, tournaments: tournaments.map((t) => t.id) };
}

/**
 * Phase C — project contributions per tournament (never touches tournament_entries).
 */
export async function projectContributionsForTournament(tournament, now = new Date()) {
  const scorer = new OffersMetricScorer(tournament.metric);
  const actions = await prisma.tournamentAction.findMany({
    where: {
      tournamentEligible: true,
      executedAtUTC: { gte: tournament.startsAt, lte: upperBound(tournament, now) },
    },
    orderBy: { id: "asc" },
  });

  let inserted = 0;
  let skipped = 0;
  for (const row of actions) {
    const payload = tournamentActionOutboxPayload(row);
    const delta = scorer.onTournamentAction(payload, tournament);
    if (!delta) continue;
    const result = await insertContributionIdempotent(tournament.id, delta);
    if (result === "inserted") inserted++;
    else skipped++;
  }

  await prisma.tournamentOfferwallMigration.upsert({
    where: { tournamentId: tournament.id },
    create: { tournamentId: tournament.id, status: "projected" },
    update: { status: "projected" },
  });

  return { tournamentId: tournament.id, inserted, skipped, actionsScanned: actions.length };
}

export async function clearContributionsForActiveTournaments() {
  const tournaments = await loadActiveOfferwallTournaments();
  const ids = tournaments.map((t) => t.id);
  if (ids.length === 0) return 0;
  const r = await prisma.tournamentScoreContribution.deleteMany({
    where: { tournamentId: { in: ids } },
  });
  return r.count;
}

export async function projectAllContributions(now = new Date()) {
  const tournaments = await loadActiveOfferwallTournaments();
  const results = [];
  for (const t of tournaments) {
    results.push(await projectContributionsForTournament(t, now));
  }
  return results;
}

export function entriesChecksum(entries) {
  const sorted = [...entries]
    .map((e) => ({ userId: e.userId, score: Number(e.score) }))
    .sort((a, b) => a.userId - b.userId);
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

/**
 * Phase D — compare legacy vs entries vs contributions (detect-only).
 */
export async function compareTournament(tournament, now = new Date()) {
  const upper = upperBound(tournament, now);
  const includeInternal = tournament.metric !== "OFFERS_EXTERNAL";
  const legacy = await computeOfferwallScores(tournament.startsAt, upper, { includeInternal });

  const entries = await prisma.tournamentEntry.findMany({
    where: { tournamentId: tournament.id },
    select: { userId: true, score: true },
  });

  const contribs = await prisma.tournamentScoreContribution.groupBy({
    by: ["userId"],
    where: { tournamentId: tournament.id },
    _sum: { metricValue: true },
  });
  const contribMap = new Map(
    contribs.map((r) => [r.userId, Number(r._sum.metricValue ?? 0)]),
  );
  const entryMap = new Map(entries.map((e) => [e.userId, Number(e.score)]));

  const allUsers = new Set([...entryMap.keys(), ...legacy.keys(), ...contribMap.keys()]);
  const drifts = [];

  for (const userId of allUsers) {
    const entry = entryMap.get(userId) ?? 0;
    const leg = legacy.get(userId)?.total ?? 0;
    const contrib = contribMap.get(userId) ?? 0;
    if (entry !== leg || entry !== contrib || leg !== contrib) {
      drifts.push({
        userId,
        entryScore: entry,
        legacyExpected: leg,
        contributionSum: contrib,
        deltaEntryLegacy: entry - leg,
        deltaEntryContrib: entry - contrib,
      });
    }
  }

  const sorted = [...entries].sort((a, b) => Number(b.score) - Number(a.score));
  const leader = sorted[0];

  return {
    tournamentId: tournament.id,
    name: tournament.name,
    metric: tournament.metric,
    driftCount: drifts.length,
    drifts,
    leader: leader
      ? {
          userId: leader.userId,
          entry: Number(leader.score),
          legacyExpected: legacy.get(leader.userId)?.total ?? 0,
          contributionSum: contribMap.get(leader.userId) ?? 0,
        }
      : null,
    participants: entries.filter((e) => Number(e.score) > 0).length,
    baselineChecksum: entriesChecksum(entries),
  };
}

export async function compareAll(now = new Date()) {
  const tournaments = await loadActiveOfferwallTournaments();
  const reports = [];
  for (const t of tournaments) {
    reports.push(await compareTournament(t, now));
  }
  const allClean = reports.every((r) => r.driftCount === 0);
  return { allClean, reports };
}

const SHADOW_DAYS = Math.max(
  1,
  parseInt(process.env.TOURNAMENT_OFFERWALL_SHADOW_DAYS ?? "7", 10) || 7,
);

/**
 * Phase E — seal tournaments when compare is 100% clean. Does NOT modify entry scores.
 */
export async function sealTournaments(reports, now = new Date()) {
  const shadowEnds = new Date(now.getTime() + SHADOW_DAYS * 24 * 60 * 60 * 1000);
  const sealed = [];

  for (const r of reports) {
    if (r.driftCount > 0) continue;
    await prisma.tournamentOfferwallMigration.upsert({
      where: { tournamentId: r.tournamentId },
      create: {
        tournamentId: r.tournamentId,
        status: "shadow_validation",
        baselineChecksum: r.baselineChecksum,
        verifiedParticipants: r.participants,
        verifiedLeaderScore: r.leader?.entry ?? 0,
        sealedAt: now,
        shadowValidationEndsAt: shadowEnds,
      },
      update: {
        status: "shadow_validation",
        baselineChecksum: r.baselineChecksum,
        verifiedParticipants: r.participants,
        verifiedLeaderScore: r.leader?.entry ?? 0,
        sealedAt: now,
        shadowValidationEndsAt: shadowEnds,
      },
    });
    sealed.push(r.tournamentId);
  }

  return { sealed, shadowValidationEndsAt: shadowEnds.toISOString() };
}

export async function backupEntries(tournamentIds, backupDir) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  await fs.mkdir(backupDir, { recursive: true });
  const snapshots = {};
  for (const id of tournamentIds) {
    const entries = await prisma.tournamentEntry.findMany({
      where: { tournamentId: id },
      select: { userId: true, score: true, firstContributionAt: true },
    });
    snapshots[id] = entries;
    await fs.writeFile(
      path.join(backupDir, `entries-tournament-${id}.json`),
      JSON.stringify(entries, null, 2),
    );
  }
  return snapshots;
}
