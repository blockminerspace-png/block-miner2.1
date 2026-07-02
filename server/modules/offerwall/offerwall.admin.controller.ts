import type { Request, Response } from "express";
import _prisma from "../../src/db/prisma.js";
import { sanitizeAdminDateRange, parseOptionalUserId } from "../../utils/sanitizeAdminDateRange.js";
import { scoringConfigPayload } from "../tournaments/offerwallTournamentScore.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = _prisma as any;

const INTERNAL_COMPLETED = "COMPLETED";
const BRT = "America/Sao_Paulo";

function bucketDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatBrt(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: BRT, day: "2-digit", month: "2-digit" });
}

export async function getOfferwallAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const parsed = sanitizeAdminDateRange(req.query.from, req.query.to);
    if (!parsed.ok) {
      res.status(400).json({ ok: false, message: parsed.message });
      return;
    }
    const { from, to, serverNow, serverNowBrt } = parsed.range;
    const userId = parseOptionalUserId(req.query.userId);
    if (req.query.userId != null && req.query.userId !== "" && userId == null) {
      res.status(400).json({ ok: false, message: "Invalid userId" });
      return;
    }

    const userFilter = userId != null ? { userId } : {};
    const dateInternal = { completedAt: { gte: from, lte: to } };
    const dateOme = { createdAt: { gte: from, lte: to } };
    const dateZerads = { callbackAt: { gte: from, lte: to } };

    const [internalAgg, omeAgg, zeradsAgg, internalRows, omeRows, zeradsRows] = await Promise.all([
      prisma.internalOfferwallAttempt.aggregate({
        where: { ...userFilter, status: INTERNAL_COMPLETED, ...dateInternal },
        _count: { id: true },
      }),
      prisma.offerwallMeCallback.aggregate({
        where: { ...userFilter, status: 1, ...dateOme },
        _count: { id: true },
        _sum: { polCredited: true },
      }),
      prisma.zeradsCallback.aggregate({
        where: { ...userFilter, ...dateZerads },
        _count: { id: true },
        _sum: { clicks: true, payoutAmount: true },
      }),
      prisma.internalOfferwallAttempt.findMany({
        where: { ...userFilter, status: INTERNAL_COMPLETED, ...dateInternal },
        select: { completedAt: true, offer: { select: { rewardPolAmount: true } } },
      }),
      prisma.offerwallMeCallback.findMany({
        where: { ...userFilter, status: 1, ...dateOme },
        select: { createdAt: true, polCredited: true },
      }),
      prisma.zeradsCallback.findMany({
        where: { ...userFilter, ...dateZerads },
        select: { callbackAt: true, clicks: true, payoutAmount: true },
      }),
    ]);

    const internalPol = internalRows.reduce(
      (s: number, r: { offer: { rewardPolAmount: unknown } }) => s + Number(r.offer?.rewardPolAmount ?? 0),
      0,
    );

    const buckets = new Map<
      string,
      { day: string; dayBrt: string; internal: number; internalPol: number; offerwallMe: number; offerwallMePol: number; zeradsCallbacks: number; zeradsClicks: number; zeradsPol: number }
    >();

    const ensure = (key: string, d: Date) => {
      if (!buckets.has(key)) {
        buckets.set(key, {
          day: key,
          dayBrt: formatBrt(d),
          internal: 0,
          internalPol: 0,
          offerwallMe: 0,
          offerwallMePol: 0,
          zeradsCallbacks: 0,
          zeradsClicks: 0,
          zeradsPol: 0,
        });
      }
      return buckets.get(key)!;
    };

    for (const r of internalRows) {
      const d = r.completedAt as Date;
      const b = ensure(bucketDayKey(d), d);
      b.internal += 1;
      b.internalPol += Number(r.offer?.rewardPolAmount ?? 0);
    }
    for (const r of omeRows) {
      const d = r.createdAt as Date;
      const b = ensure(bucketDayKey(d), d);
      b.offerwallMe += 1;
      b.offerwallMePol += Number(r.polCredited ?? 0);
    }
    for (const r of zeradsRows) {
      const d = r.callbackAt as Date;
      const b = ensure(bucketDayKey(d), d);
      b.zeradsCallbacks += 1;
      b.zeradsClicks += Number(r.clicks ?? 0);
      b.zeradsPol += Number(r.payoutAmount ?? 0);
    }

    const daily = Array.from(buckets.values()).sort((a, b) => a.day.localeCompare(b.day));

    res.json({
      ok: true,
      from: from.toISOString(),
      to: to.toISOString(),
      serverNow,
      serverNowBrt,
      userId,
      scoringConfig: scoringConfigPayload(),
      totals: {
        internal: { count: internalAgg._count.id, pol: internalPol },
        offerwallMe: {
          count: omeAgg._count.id,
          pol: Number(omeAgg._sum.polCredited ?? 0),
        },
        zerads: {
          callbacks: zeradsAgg._count.id,
          clicks: Number(zeradsAgg._sum.clicks ?? 0),
          pol: Number(zeradsAgg._sum.payoutAmount ?? 0),
        },
      },
      daily,
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}
