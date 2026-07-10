import type { Request, Response } from "express";
import prisma from "../src/db/prisma.js";

import loggerLib from "../utils/logger.js";
const logger = loggerLib.child("gamesPowerController");

/**
 * GET /api/games/active-powers
 * Read-only: sums non-expired UserPowerGame rows for the authenticated user
 * and returns an optional per-game breakdown. Also returns active rack machine
 * hash for UI contrast (permanent vs temporary).
 */
export async function getActiveGamePowers(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const userId = req.user.id;
    const now = new Date();

    const [powerRows, machineAgg] = await Promise.all([
      prisma.userPowerGame.findMany({
        where: { userId, expiresAt: { gt: now } },
        include: { game: { select: { id: true, name: true, slug: true } } },
      }),
      prisma.userMiner.aggregate({
        where: { userId, isActive: true },
        _sum: { hashRate: true },
      }),
    ]);

    let totalHashRate = 0;
    const byGame = new Map<
      number,
      { gameId: number; slug: string; name: string; hashRate: number }
    >();

    for (const row of powerRows) {
      const h = Number(row.hashRate || 0);
      totalHashRate += h;
      const key = row.gameId;
      if (!byGame.has(key)) {
        byGame.set(key, {
          gameId: key,
          slug: row.game?.slug ?? "",
          name: row.game?.name ?? "",
          hashRate: 0,
        });
      }
      const entry = byGame.get(key);
      if (entry) entry.hashRate += h;
    }

    const breakdown = Array.from(byGame.values()).sort((a, b) => b.hashRate - a.hashRate);
    const machineHashRate = Number(machineAgg._sum.hashRate || 0);

    res.json({
      ok: true,
      totalHashRate,
      machineHashRate,
      breakdown,
    });
  } catch (err: unknown) {
    logger.error("getActiveGamePowers", { error: String(err) });
    res.status(500).json({ ok: false, message: "Unable to load game powers." });
  }
}
