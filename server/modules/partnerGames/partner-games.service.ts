import type { Prisma } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import { syncUserBaseHashRate } from "../../models/minerProfileModel.js";
import { createAuditLogBestEffort } from "../../models/auditLogModel.js";
import {
  PARTNER_HEARTBEAT_MAX_DELTA_MS,
  PARTNER_HEARTBEAT_MIN_GAP_MS,
  PARTNER_POWER_DURATION_MS,
  PARTNER_REWARD_CYCLE_MS,
  PARTNER_REWARD_HASH_PER_MINUTE,
  PARTNER_SESSION_STALE_MS,
} from "./partner-games.config.js";

type Tx = Prisma.TransactionClient;

export function slugifyPartnerGameTitle(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "partner-game";
}

function utcDayStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function logSessionEvent(
  tx: Tx,
  data: {
    sessionId: string;
    userId: number;
    partnerGameId: number;
    event: string;
    meta?: Record<string, unknown>;
  },
) {
  await tx.partnerGameSessionEvent.create({
    data: {
      sessionId: data.sessionId,
      userId: data.userId,
      partnerGameId: data.partnerGameId,
      event: data.event,
      meta: (data.meta ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

async function getOrCreatePartnerPlayGameId(
  tx: Tx,
  partnerSlug: string,
  partnerTitle: string,
): Promise<number> {
  const slug = `partner-${partnerSlug}`;
  const existing = await tx.game.findUnique({ where: { slug }, select: { id: true } });
  if (existing) return existing.id;
  const created = await tx.game.create({
    data: { name: `Partner: ${partnerTitle}`, slug, isActive: true },
  });
  return created.id;
}

async function sumHashEarnedTodayUtc(userId: number, partnerSlug: string): Promise<number> {
  const gameSlug = `partner-${partnerSlug}`;
  const game = await prisma.game.findUnique({ where: { slug: gameSlug }, select: { id: true } });
  if (!game) return 0;
  const rows = await prisma.userPowerGame.findMany({
    where: { userId, gameId: game.id, playedAt: { gte: utcDayStart() } },
    select: { hashRate: true },
  });
  return rows.reduce((sum, row) => sum + Number(row.hashRate || 0), 0);
}

async function grantPartnerMinuteReward(
  tx: Tx,
  session: { id: string; userId: number; partnerGameId: number },
  partner: { slug: string; title: string },
): Promise<number> {
  const gameId = await getOrCreatePartnerPlayGameId(tx, partner.slug, partner.title);
  const expiresAt = new Date(Date.now() + PARTNER_POWER_DURATION_MS);
  const powerRow = await tx.userPowerGame.create({
    data: {
      userId: session.userId,
      gameId,
      hashRate: PARTNER_REWARD_HASH_PER_MINUTE,
      playedAt: new Date(),
      expiresAt,
    },
  });

  await logSessionEvent(tx, {
    sessionId: session.id,
    userId: session.userId,
    partnerGameId: session.partnerGameId,
    event: "reward_granted",
    meta: { hashRate: PARTNER_REWARD_HASH_PER_MINUTE, userPowerGameId: powerRow.id },
  });

  return powerRow.id;
}

function applyRewardCycles(rewardCycleMs: number): { remainingMs: number; grants: number } {
  const grants = Math.floor(rewardCycleMs / PARTNER_REWARD_CYCLE_MS);
  const remainingMs = rewardCycleMs % PARTNER_REWARD_CYCLE_MS;
  return { remainingMs, grants };
}

function sessionPayload(
  session: {
    id: string;
    status: string;
    accumulatedMs: number;
    rewardCycleMs: number;
    totalHashGranted: number;
    grantsCount: number;
    startedAt: Date;
  },
  hashEarnedToday: number,
  rewardGranted: boolean,
) {
  const nextRewardInMs = Math.max(0, PARTNER_REWARD_CYCLE_MS - session.rewardCycleMs);
  return {
    sessionId: session.id,
    status: session.status,
    playingSeconds: Math.floor(session.accumulatedMs / 1000),
    hashEarnedSession: session.totalHashGranted,
    hashEarnedToday,
    grantsCount: session.grantsCount,
    nextRewardInMs,
    rewardGranted: rewardGranted
      ? { hashRate: PARTNER_REWARD_HASH_PER_MINUTE }
      : null,
  };
}

export async function getPartnerGameBySlug(slug: string) {
  return prisma.partnerGame.findFirst({
    where: { slug, isVisible: true },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      coverImageUrl: true,
      iframeUrl: true,
      fallbackUrl: true,
      partnerUrl: true,
    },
  });
}

export async function startPartnerGameSession(userId: number, slug: string) {
  const game = await getPartnerGameBySlug(slug);
  if (!game) throw new Error("PARTNER_GAME_NOT_FOUND");

  const now = new Date();

  // End stale sessions for this user.
  const staleCutoff = new Date(now.getTime() - PARTNER_SESSION_STALE_MS);
  await prisma.partnerGameSession.updateMany({
    where: {
      userId,
      status: { in: ["active", "paused"] },
      OR: [{ lastHeartbeatAt: { lt: staleCutoff } }, { lastHeartbeatAt: null, startedAt: { lt: staleCutoff } }],
    },
    data: { status: "ended", endedAt: now },
  });

  const existing = await prisma.partnerGameSession.findFirst({
    where: { userId, partnerGameId: game.id, status: { in: ["active", "paused"] } },
    include: { partnerGame: { select: { slug: true } } },
  });

  if (existing) {
    const hashEarnedToday = await sumHashEarnedTodayUtc(userId, existing.partnerGame.slug);
    return {
      game,
      ...sessionPayload(existing, hashEarnedToday, false),
    };
  }

  const session = await prisma.$transaction(async (tx) => {
    await tx.partnerGameSession.updateMany({
      where: { userId, status: { in: ["active", "paused"] } },
      data: { status: "ended", endedAt: now },
    });

    const created = await tx.partnerGameSession.create({
      data: {
        userId,
        partnerGameId: game.id,
        status: "active",
        lastHeartbeatAt: now,
      },
    });

    await logSessionEvent(tx, {
      sessionId: created.id,
      userId,
      partnerGameId: game.id,
      event: "started",
    });

    return created;
  });

  void createAuditLogBestEffort({
    userId,
    action: "PARTNER_GAME_SESSION_STARTED",
    details: { partnerGameId: game.id, slug: game.slug, sessionId: session.id },
  });

  const hashEarnedToday = await sumHashEarnedTodayUtc(userId, game.slug);
  return {
    game,
    ...sessionPayload(session, hashEarnedToday, false),
  };
}

export async function heartbeatPartnerGameSession(
  userId: number,
  sessionId: string,
  input: { active: boolean; iframeLoaded?: boolean },
) {
  const session = await prisma.partnerGameSession.findUnique({
    where: { id: sessionId },
    include: { partnerGame: { select: { slug: true, title: true } } },
  });

  if (!session || session.userId !== userId) throw new Error("SESSION_NOT_FOUND");
  if (session.status === "ended") throw new Error("SESSION_ENDED");

  const now = new Date();
  const hashEarnedToday = await sumHashEarnedTodayUtc(userId, session.partnerGame.slug);

  if (!input.active || input.iframeLoaded === false) {
    let rewardGranted = false;
    const paused = await prisma.$transaction(async (tx) => {
      const current = await tx.partnerGameSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: { partnerGame: { select: { slug: true, title: true } } },
      });

      let accumulatedMs = current.accumulatedMs;
      let rewardCycleMs = current.rewardCycleMs;
      let totalHashGranted = current.totalHashGranted;
      let grantsCount = current.grantsCount;

      if (current.status === "active" && current.lastHeartbeatAt) {
        const deltaMs = Math.min(
          now.getTime() - current.lastHeartbeatAt.getTime(),
          PARTNER_HEARTBEAT_MAX_DELTA_MS,
        );
        if (deltaMs >= PARTNER_HEARTBEAT_MIN_GAP_MS) {
          accumulatedMs += deltaMs;
          rewardCycleMs += deltaMs;
        }
      }

      const cycles = applyRewardCycles(rewardCycleMs);
      rewardCycleMs = cycles.remainingMs;
      for (let i = 0; i < cycles.grants; i += 1) {
        await grantPartnerMinuteReward(tx, current, current.partnerGame);
        totalHashGranted += PARTNER_REWARD_HASH_PER_MINUTE;
        grantsCount += 1;
        rewardGranted = true;
      }

      const updated = await tx.partnerGameSession.update({
        where: { id: sessionId },
        data: {
          status: "paused",
          accumulatedMs,
          rewardCycleMs,
          totalHashGranted,
          grantsCount,
          lastHeartbeatAt: now,
        },
      });

      if (current.status === "active") {
        await logSessionEvent(tx, {
          sessionId,
          userId,
          partnerGameId: current.partnerGameId,
          event: "paused",
        });
      }

      return updated;
    });

    if (rewardGranted) await syncUserBaseHashRate(userId);
    const todayHash = await sumHashEarnedTodayUtc(userId, session.partnerGame.slug);
    return sessionPayload(paused, todayHash, rewardGranted);
  }

  if (
    session.lastHeartbeatAt &&
    now.getTime() - session.lastHeartbeatAt.getTime() < PARTNER_HEARTBEAT_MIN_GAP_MS
  ) {
    return sessionPayload(session, hashEarnedToday, false);
  }

  let rewardGranted = false;
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.partnerGameSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { partnerGame: { select: { slug: true, title: true } } },
    });

    let accumulatedMs = current.accumulatedMs;
    let rewardCycleMs = current.rewardCycleMs;
    let totalHashGranted = current.totalHashGranted;
    let grantsCount = current.grantsCount;

    if (current.status === "active" && current.lastHeartbeatAt) {
      const deltaMs = Math.min(
        now.getTime() - current.lastHeartbeatAt.getTime(),
        PARTNER_HEARTBEAT_MAX_DELTA_MS,
      );
      if (deltaMs >= PARTNER_HEARTBEAT_MIN_GAP_MS) {
        accumulatedMs += deltaMs;
        rewardCycleMs += deltaMs;
      }
    } else if (current.status === "paused") {
      await logSessionEvent(tx, {
        sessionId,
        userId,
        partnerGameId: current.partnerGameId,
        event: "resumed",
      });
    }

    while (rewardCycleMs >= PARTNER_REWARD_CYCLE_MS) {
      await grantPartnerMinuteReward(tx, current, current.partnerGame);
      rewardCycleMs -= PARTNER_REWARD_CYCLE_MS;
      totalHashGranted += PARTNER_REWARD_HASH_PER_MINUTE;
      grantsCount += 1;
      rewardGranted = true;
    }

    const updated = await tx.partnerGameSession.update({
      where: { id: sessionId },
      data: {
        status: "active",
        accumulatedMs,
        rewardCycleMs,
        totalHashGranted,
        grantsCount,
        lastHeartbeatAt: now,
      },
    });

    return updated;
  });

  if (rewardGranted) {
    await syncUserBaseHashRate(userId);
    void createAuditLogBestEffort({
      userId,
      action: "PARTNER_GAME_REWARD_GRANTED",
      details: {
        sessionId,
        partnerGameId: session.partnerGameId,
        hashRate: PARTNER_REWARD_HASH_PER_MINUTE,
      },
    });
  }

  const todayHash = await sumHashEarnedTodayUtc(userId, session.partnerGame.slug);
  return sessionPayload(result, todayHash, rewardGranted);
}

export async function endPartnerGameSession(userId: number, sessionId: string, reason = "user_left") {
  const session = await prisma.partnerGameSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) return;
  if (session.status === "ended") return;

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.partnerGameSession.update({
      where: { id: sessionId },
      data: { status: "ended", endedAt: now },
    });
    await logSessionEvent(tx, {
      sessionId,
      userId,
      partnerGameId: session.partnerGameId,
      event: reason === "unmount" ? "ended" : "abandoned",
      meta: { reason },
    });
  });
}

export async function getPartnerGameSessionStats(userId: number, slug: string) {
  const game = await getPartnerGameBySlug(slug);
  if (!game) throw new Error("PARTNER_GAME_NOT_FOUND");

  const hashEarnedToday = await sumHashEarnedTodayUtc(userId, game.slug);
  const active = await prisma.partnerGameSession.findFirst({
    where: { userId, partnerGameId: game.id, status: { in: ["active", "paused"] } },
  });

  if (!active) {
    return { game, hashEarnedToday, session: null };
  }

  return {
    game,
    hashEarnedToday,
    session: sessionPayload(active, hashEarnedToday, false),
  };
}
