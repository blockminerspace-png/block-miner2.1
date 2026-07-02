import _prisma from "../../../src/db/prisma.js";
import { computeOfferwallScores } from "../offerwallTournamentScore.js";
import { isOfferwallIncrementalMetric } from "./tournament-engine-metrics.service.js";
import loggerLib from "../../../utils/logger.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;
const logger = loggerLib.child("OfferwallShadowValidation");

const INTEGER_TOLERANCE = 0;

function upperBound(tournament: { endsAt: Date }): Date {
  const now = new Date();
  return tournament.endsAt < now ? tournament.endsAt : now;
}

export type ShadowValidationReport = {
  tournamentId: number;
  driftCount: number;
  checkedAt: string;
  shadowPeriodEnded: boolean;
};

/**
 * Phase H — compare legacy batch vs ledger contributions. Never mutates rankings.
 */
export async function runOfferwallShadowValidation(): Promise<ShadowValidationReport[]> {
  const now = new Date();
  const migrations = await prisma.tournamentOfferwallMigration.findMany({
    where: { status: "shadow_validation" },
    include: { tournament: true },
  });

  const reports: ShadowValidationReport[] = [];

  for (const mig of migrations) {
    const tournament = mig.tournament;
    if (!tournament || tournament.status !== "ACTIVE") continue;
    if (!isOfferwallIncrementalMetric(tournament.metric)) continue;

    const shadowEnded =
      mig.shadowValidationEndsAt != null && mig.shadowValidationEndsAt <= now;

    const upper = upperBound(tournament);
    const includeInternal = tournament.metric !== "OFFERS_EXTERNAL";
    const legacy = await computeOfferwallScores(tournament.startsAt, upper, {
      includeInternal,
    });

    const contribs = await prisma.tournamentScoreContribution.groupBy({
      by: ["userId"],
      where: { tournamentId: tournament.id },
      _sum: { metricValue: true },
    });
    const contribMap = new Map<number, number>(
      contribs.map((r: { userId: number; _sum: { metricValue: unknown } }) => [
        r.userId,
        Number(r._sum.metricValue ?? 0),
      ]),
    );

    const allUsers = new Set([...legacy.keys(), ...contribMap.keys()]);
    let driftCount = 0;

    for (const userId of allUsers) {
      const legacyScore = legacy.get(userId)?.total ?? 0;
      const ledgerScore = contribMap.get(userId) ?? 0;
      const delta = legacyScore - ledgerScore;
      if (Math.abs(delta) <= INTEGER_TOLERANCE) continue;

      driftCount++;
      await prisma.tournamentShadowValidationAlert.create({
        data: {
          tournamentId: tournament.id,
          userId,
          legacyScore,
          ledgerScore,
          delta,
        },
      });

      logger.warn("tournament.offerwall.shadow.drift", {
        tournamentId: tournament.id,
        userId,
        legacyScore,
        ledgerScore,
        delta,
      });
    }

    if (driftCount === 0) {
      logger.info("tournament.offerwall.shadow.ok", {
        tournamentId: tournament.id,
        metric: tournament.metric,
      });
    }

    const alertsSinceSeal = mig.sealedAt
      ? await prisma.tournamentShadowValidationAlert.count({
          where: {
            tournamentId: tournament.id,
            detectedAt: { gte: mig.sealedAt },
          },
        })
      : 0;

    const canRemoveLegacy =
      shadowEnded && driftCount === 0 && alertsSinceSeal === 0;

    await prisma.tournamentOfferwallMigration.update({
      where: { tournamentId: tournament.id },
      data: {
        lastShadowCheckAt: now,
        ...(canRemoveLegacy ? { status: "legacy_removed" } : {}),
      },
    });

    reports.push({
      tournamentId: tournament.id,
      driftCount,
      checkedAt: now.toISOString(),
      shadowPeriodEnded: shadowEnded,
    });
  }

  return reports;
}

export async function listShadowValidationAlerts(tournamentId: number, limit = 50) {
  return prisma.tournamentShadowValidationAlert.findMany({
    where: { tournamentId },
    orderBy: { detectedAt: "desc" },
    take: limit,
  });
}

export async function isOfferwallTournamentSealed(tournamentId: number): Promise<boolean> {
  const row = await prisma.tournamentOfferwallMigration.findUnique({
    where: { tournamentId },
  });
  if (!row) return false;
  return (
    row.status === "shadow_validation" ||
    row.status === "sealed" ||
    row.status === "legacy_removed"
  );
}
