import type { Request, Response } from "express";
import prisma from "../../src/db/prisma.js";
import loggerLib from "../../utils/logger.js";

const logger = loggerLib.child("PublicStats");

function maskUsername(name: string | null | undefined): string {
  const s = name ?? "user";
  if (s.length <= 2) return s + "***";
  return s.slice(0, 2) + "***";
}

function decimalToNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toString?: () => string }).toString === "function"
  ) {
    const n = Number((value as { toString: () => string }).toString());
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * GET /api/public-stats — landing trust strip; must stay best-effort (no 500 on partial DB issues).
 */
export async function getPublicStats(_req: Request, res: Response): Promise<void> {
  const settled = await Promise.allSettled([
    prisma.user.count(),
    prisma.transaction.aggregate({
      where: { type: "withdrawal", status: "completed" },
      _sum: { amount: true },
    }),
    prisma.userMiner.count({ where: { isActive: true } }),
  ]);

  const failures: Array<{ metric: string; reason: string }> = [];
  let userCount = 0;
  let totalWithdrawn = 0;
  let activeMiners = 0;

  if (settled[0].status === "fulfilled") {
    userCount = settled[0].value;
  } else {
    const r = settled[0].reason;
    failures.push({
      metric: "users",
      reason: r instanceof Error ? r.message : String(r),
    });
  }

  if (settled[1].status === "fulfilled") {
    totalWithdrawn = decimalToNumber(settled[1].value._sum?.amount);
  } else {
    const r = settled[1].reason;
    failures.push({
      metric: "withdrawals",
      reason: r instanceof Error ? r.message : String(r),
    });
  }

  if (settled[2].status === "fulfilled") {
    activeMiners = settled[2].value;
  } else {
    const r = settled[2].reason;
    failures.push({
      metric: "activeMiners",
      reason: r instanceof Error ? r.message : String(r),
    });
  }

  if (failures.length > 0) {
    logger.warn("public-stats degraded", { failures });
  }

  res.json({
    ok: true,
    users: userCount,
    totalWithdrawn,
    activeMiners,
    launchDate: "2026-03-05T00:00:00.000Z",
    ...(failures.length > 0 ? { degraded: true } : {}),
  });
}

/**
 * GET /api/public-feed — last 10 payments + last 10 deposits for landing page trust feed.
 * Usernames are masked (first 2 chars + ***).
 */
export async function getPublicFeed(_req: Request, res: Response): Promise<void> {
  try {
    const [withdrawals, deposits] = await Promise.all([
      prisma.transaction.findMany({
        where: { type: "withdrawal", status: "completed" },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          amount: true,
          createdAt: true,
          user: { select: { username: true } },
        },
      }),
      prisma.transaction.findMany({
        where: { type: "deposit", status: "completed" },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          amount: true,
          createdAt: true,
          user: { select: { username: true } },
        },
      }),
    ]);

    const mapRow = (r: { id: number; amount: unknown; createdAt: Date; user: { username: string | null } }) => ({
      id: r.id,
      user: maskUsername(r.user?.username),
      amount: decimalToNumber(r.amount),
      at: r.createdAt.toISOString(),
    });

    res.json({ ok: true, withdrawals: withdrawals.map(mapRow), deposits: deposits.map(mapRow) });
  } catch (err) {
    logger.warn("public-feed failed", { err: err instanceof Error ? err.message : String(err) });
    res.json({ ok: true, withdrawals: [], deposits: [] });
  }
}
