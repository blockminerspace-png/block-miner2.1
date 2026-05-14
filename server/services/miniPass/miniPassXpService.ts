import { Prisma } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import { isMiniPassSeasonLive } from "./miniPassSeasonLive.js";

type ApplyMiniPassXpArgs = {
  userId: number;
  seasonId: number;
  amount: number | string;
  source: string;
  idempotencyKey: string;
  missionId?: number | null;
  periodKey?: string | null;
  metadataJson?: Prisma.InputJsonValue | null;
  tx?: Prisma.TransactionClient | null;
};

/**
 * Idempotent XP grant: duplicate idempotency_key returns { duplicate: true } without changing totals.
 * Keeps enrollment.totalXp in sync with the sum of ledger rows for fast reads.
 */
export async function applyMiniPassXp({
  userId,
  seasonId,
  amount,
  source,
  idempotencyKey,
  missionId = null,
  periodKey = null,
  metadataJson = null,
  tx: outerTx = null
}: ApplyMiniPassXpArgs) {
  const n = Math.floor(Number(amount));
  if (!userId || !seasonId || !idempotencyKey || !Number.isFinite(n) || n <= 0) {
    return { ok: false, code: "invalid_input" };
  }

  const run = async (tx: Prisma.TransactionClient) => {
    const season = await tx.miniPassSeason.findFirst({
      where: { id: seasonId, deletedAt: null }
    });
    if (!season) {
      const err = new Error("SEASON_NOT_FOUND");
      err.code = "SEASON_NOT_FOUND";
      throw err;
    }
    if (!isMiniPassSeasonLive(season, new Date())) {
      const err = new Error("SEASON_NOT_LIVE");
      err.code = "SEASON_NOT_LIVE";
      throw err;
    }

    await tx.userMiniPassEnrollment.upsert({
      where: { userId_seasonId: { userId, seasonId } },
      create: { userId, seasonId, totalXp: 0 },
      update: {}
    });

    try {
      await tx.userMiniPassXpLedger.create({
        data: {
          userId,
          seasonId,
          amount: n,
          source,
          idempotencyKey,
          missionId,
          periodKey,
          metadataJson: metadataJson ?? undefined
        }
      });
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return { ok: true, duplicate: true };
      }
      throw e;
    }

    await tx.userMiniPassEnrollment.update({
      where: { userId_seasonId: { userId, seasonId } },
      data: { totalXp: { increment: n } }
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: "MINI_PASS_XP",
        ip: null,
        userAgent: null,
        detailsJson: JSON.stringify({
          seasonId,
          amount: n,
          source,
          idempotencyKey,
          missionId,
          periodKey
        })
      }
    });

    return { ok: true, duplicate: false };
  };

  if (outerTx) return run(outerTx);
  return prisma.$transaction(run);
}
