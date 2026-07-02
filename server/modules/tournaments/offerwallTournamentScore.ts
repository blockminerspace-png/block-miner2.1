import _prisma from "../../src/db/prisma.js";
import {
  ZERADS_MAX_CLICKS_PER_UTC_DAY,
  aggregateZeradsClicksPerUser,
  capZeradsClicksForUtcDay,
} from "../zerads/zeradsClickLimits.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const INTERNAL_OFFER_COMPLETED = "COMPLETED";

export const TOURNAMENT_ZERADS_MAX_PER_WINDOW = ZERADS_MAX_CLICKS_PER_UTC_DAY;

export const ZERADS_SCORING_MODE = "clicks" as const;

export type OfferwallScoreBreakdown = {
  internal: number;
  offerwallMe: number;
  zeradsRaw: number;
  /** Cliques Zerads válidos (teto 100/dia UTC). */
  zeradsCredited: number;
  zeradsCapped: number;
  total: number;
};

export function capZeradsPoints(raw: number): number {
  return capZeradsClicksForUtcDay(raw);
}

export function scoringConfigPayload() {
  return {
    zeradsMode: ZERADS_SCORING_MODE,
    zeradsMaxPerUtcDay: ZERADS_MAX_CLICKS_PER_UTC_DAY,
    zeradsMaxPerBrtDay: ZERADS_MAX_CLICKS_PER_UTC_DAY,
    zeradsMaxPerWindow: ZERADS_MAX_CLICKS_PER_UTC_DAY,
  };
}

export function formatUtcWindowLabel(startsAt: Date, endsAt: Date): { start: string; end: string } {
  const fmt = (d: Date) =>
    `${d.toISOString().replace("T", " ").slice(0, 16)} UTC`;
  return { start: fmt(startsAt), end: fmt(endsAt) };
}

/** @deprecated use formatUtcWindowLabel */
export const formatBrtWindowLabel = formatUtcWindowLabel;

function mergeBreakdown(
  map: Map<number, OfferwallScoreBreakdown>,
  userId: number,
  patch: Partial<OfferwallScoreBreakdown>,
): void {
  const prev = map.get(userId) ?? {
    internal: 0,
    offerwallMe: 0,
    zeradsRaw: 0,
    zeradsCredited: 0,
    zeradsCapped: 0,
    total: 0,
  };
  const next = { ...prev, ...patch };
  if (patch.zeradsCredited != null) {
    next.zeradsCapped = patch.zeradsCredited;
  } else if (patch.zeradsCapped != null) {
    next.zeradsCredited = patch.zeradsCapped;
  }
  next.total = next.internal + next.offerwallMe + next.zeradsCredited;
  map.set(userId, next);
}

/**
 * @deprecated Legacy batch scoring — use TournamentAction + Engine V2 (offerwall.scorer.ts).
 * Retained for admin offerwall analytics only.
 */
export async function computeOfferwallScores(
  startsAt: Date,
  upperBound: Date,
  opts?: { userId?: number; includeInternal?: boolean },
): Promise<Map<number, OfferwallScoreBreakdown>> {
  const includeInternal = opts?.includeInternal !== false;
  const userFilter = opts?.userId != null ? { userId: opts.userId } : {};
  const map = new Map<number, OfferwallScoreBreakdown>();

  if (includeInternal) {
    const internal = await prisma.internalOfferwallAttempt.groupBy({
      by: ["userId"],
      where: {
        ...userFilter,
        status: INTERNAL_OFFER_COMPLETED,
        completedAt: { gte: startsAt, lte: upperBound },
      },
      _count: { id: true },
    });
    for (const r of internal) {
      mergeBreakdown(map, r.userId, { internal: r._count.id });
    }
  }

  const ome = await prisma.offerwallMeCallback.groupBy({
    by: ["userId"],
    where: {
      ...userFilter,
      createdAt: { gte: startsAt, lte: upperBound },
      status: 1,
    },
    _count: { id: true },
  });
  for (const r of ome) {
    const prev = map.get(r.userId);
    mergeBreakdown(map, r.userId, {
      offerwallMe: r._count.id,
      internal: prev?.internal ?? 0,
    });
  }

  const zeradsRows = await prisma.zeradsCallback.findMany({
    where: {
      ...userFilter,
      callbackAt: { gte: startsAt, lte: upperBound },
    },
    select: { userId: true, callbackAt: true, clicks: true },
  });
  const zeradsByUser = aggregateZeradsClicksPerUser(zeradsRows);
  for (const [userId, totals] of zeradsByUser) {
    if (totals.credited <= 0 && totals.raw <= 0) continue;
    const prev = map.get(userId);
    mergeBreakdown(map, userId, {
      zeradsRaw: totals.raw,
      zeradsCredited: totals.credited,
      internal: prev?.internal ?? 0,
      offerwallMe: prev?.offerwallMe ?? 0,
    });
  }

  return map;
}

export async function computeOfferwallScoreForUser(
  userId: number,
  startsAt: Date,
  upperBound: Date,
  includeInternal = true,
): Promise<OfferwallScoreBreakdown> {
  const map = await computeOfferwallScores(startsAt, upperBound, { userId, includeInternal });
  return (
    map.get(userId) ?? {
      internal: 0,
      offerwallMe: 0,
      zeradsRaw: 0,
      zeradsCredited: 0,
      zeradsCapped: 0,
      total: 0,
    }
  );
}

const DETAIL_LIMIT = 200;

export async function getOfferwallScoreDetailForUser(
  userId: number,
  startsAt: Date,
  upperBound: Date,
) {
  const [internalAttempts, offerwallMe, zerads] = await Promise.all([
    prisma.internalOfferwallAttempt.findMany({
      where: {
        userId,
        status: INTERNAL_OFFER_COMPLETED,
        completedAt: { gte: startsAt, lte: upperBound },
      },
      orderBy: { completedAt: "desc" },
      take: DETAIL_LIMIT,
      select: {
        offerId: true,
        completedAt: true,
        offer: { select: { title: true } },
      },
    }),
    prisma.offerwallMeCallback.findMany({
      where: {
        userId,
        status: 1,
        createdAt: { gte: startsAt, lte: upperBound },
      },
      orderBy: { createdAt: "desc" },
      take: DETAIL_LIMIT,
      select: {
        transId: true,
        offerName: true,
        createdAt: true,
        polCredited: true,
      },
    }),
    prisma.zeradsCallback.findMany({
      where: {
        userId,
        callbackAt: { gte: startsAt, lte: upperBound },
      },
      orderBy: { callbackAt: "desc" },
      take: DETAIL_LIMIT,
      select: {
        callbackAt: true,
        clicks: true,
        payoutAmount: true,
        callbackHash: true,
      },
    }),
  ]);

  const breakdown = await computeOfferwallScoreForUser(userId, startsAt, upperBound);

  return {
    breakdown,
    internalAttempts: internalAttempts.map((a: { offerId: number; completedAt: Date; offer: { title: string } }) => ({
      offerId: a.offerId,
      title: a.offer.title,
      completedAt: a.completedAt.toISOString(),
    })),
    offerwallMe: offerwallMe.map((r: { transId: string; offerName: string | null; createdAt: Date; polCredited: number }) => ({
      transId: r.transId,
      offerName: r.offerName,
      createdAt: r.createdAt.toISOString(),
      polCredited: Number(r.polCredited),
    })),
    zerads: zerads.map((z: { callbackAt: Date; clicks: number; payoutAmount: number; callbackHash: string }) => ({
      callbackAt: z.callbackAt.toISOString(),
      clicks: z.clicks,
      payoutAmount: Number(z.payoutAmount),
      callbackHash: z.callbackHash.length > 16 ? `${z.callbackHash.slice(0, 16)}…` : z.callbackHash,
    })),
  };
}
