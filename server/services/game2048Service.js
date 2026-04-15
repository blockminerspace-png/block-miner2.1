import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import { syncUserBaseHashRate } from "../models/minerProfileModel.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { notifyMiniPassGamePlayed } from "./miniPass/miniPassMissionHookService.js";
import { notifyDailyTaskGamePlayed } from "./dailyTasks/dailyTaskHookService.js";
import {
  createInitialBoard,
  emptyBoard,
  hasValidMove,
  maxTile,
  moveBoard,
  parseBoard,
  spawnRandomTile
} from "./game2048Engine.js";
import { getBrazilCheckinDateKey } from "../utils/checkinDate.js";
import {
  GAME2048_GAME_SLUG,
  game2048CooldownMs,
  game2048MinScore,
  game2048PowerDays,
  game2048RewardHashRate,
  game2048TimeLimitSec,
  game2048WinTile,
  rewardDurationFromCheckinToday
} from "../utils/game2048Constants.js";

const SESSION_ACTIVE = "ACTIVE";
const SESSION_ENDED = "ENDED";
const SESSION_CLAIMED = "CLAIMED";

const STALE_ACTIVE_MS = 48 * 60 * 60 * 1000;

const game2048Log = loggerLib.child("Game2048");

/**
 * @param {Date | null | undefined} claimedAt
 * @param {Date} now
 * @returns {Date | null}
 */
export function computeCooldownEndsAt(claimedAt, now) {
  const cdMs = game2048CooldownMs();
  if (cdMs <= 0 || !claimedAt) return null;
  const end = new Date(claimedAt.getTime() + cdMs);
  return end > now ? end : null;
}

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 */
async function getOrCreateGame2048GameId(tx) {
  const g = await tx.game.upsert({
    where: { slug: GAME2048_GAME_SLUG },
    create: {
      name: "Chain 2048",
      slug: GAME2048_GAME_SLUG,
      isActive: true
    },
    update: {}
  });
  return g.id;
}

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {number} userId
 */
async function lockUserFor2048(tx, userId) {
  await tx.$queryRaw`SELECT 1 FROM users WHERE id = ${userId} FOR UPDATE`;
}

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {number} userId
 * @param {Date} now
 */
async function userHasConfirmedCheckinBrazilToday(tx, userId, now) {
  const todayKey = getBrazilCheckinDateKey(now);
  const row = await tx.dailyCheckin.findUnique({
    where: { userId_checkinDate: { userId, checkinDate: todayKey } },
    select: { status: true }
  });
  return Boolean(row && row.status === "confirmed");
}

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {number} userId
 * @param {Date} now
 */
async function expireStaleActiveSessions(tx, userId, now) {
  const threshold = new Date(now.getTime() - STALE_ACTIVE_MS);
  await tx.game2048Session.updateMany({
    where: {
      userId,
      status: SESSION_ACTIVE,
      updatedAt: { lt: threshold }
    },
    data: { status: SESSION_ENDED, endedAt: now }
  });
}

/**
 * @param {import("@prisma/client").Prisma.JsonValue} boardJson
 * @returns {number[][] | null}
 */
function boardFromRow(boardJson) {
  const parsed = parseBoard(boardJson);
  if (!parsed && boardJson != null) {
    const snippet = (() => {
      try {
        return JSON.stringify(boardJson).slice(0, 160);
      } catch {
        return "[unserializable]";
      }
    })();
    game2048Log.warn("game2048_board_parse_failed", { snippet });
  }
  return parsed;
}

/**
 * @param {import("@prisma/client").Game2048Session} row
 * @param {Date} now
 */
function secondsRemainingForSession(row, now) {
  const limit = game2048TimeLimitSec();
  if (limit <= 0) return null;
  const startMs = new Date(row.createdAt).getTime();
  const elapsedSec = Math.floor((now.getTime() - startMs) / 1000);
  if (row.status !== SESSION_ACTIVE) return 0;
  return Math.max(0, limit - elapsedSec);
}

/**
 * Ends ACTIVE session when the round timer has elapsed.
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {import("@prisma/client").Game2048Session} row
 * @param {Date} now
 */
async function finalizeTimedOutSession(tx, row, now) {
  const limit = game2048TimeLimitSec();
  if (limit <= 0 || row.status !== SESSION_ACTIVE) return row;
  const startMs = new Date(row.createdAt).getTime();
  if (now.getTime() - startMs < limit * 1000) return row;
  return tx.game2048Session.update({
    where: { id: row.id },
    data: { status: SESSION_ENDED, endedAt: now }
  });
}

/**
 * @param {object} row
 * @param {Date} now
 */
function serializeSession(row, now, rewardHint) {
  const board = boardFromRow(row.board);
  const winTile = game2048WinTile();
  const minScore = game2048MinScore();
  const hasMoves = board ? hasValidMove(board) : false;
  const scoreReached = (Number(row.score) || 0) >= minScore;
  const tileReached = board ? maxTile(board) >= winTile : false;
  const rewardEligible = scoreReached || tileReached;
  const canClaim =
    rewardEligible &&
    !row.rewardGranted &&
    row.status !== SESSION_CLAIMED &&
    row.status !== SESSION_ACTIVE;
  const timeLimitSeconds = game2048TimeLimitSec();
  const secLeft = secondsRemainingForSession(row, now);
  const rd = rewardHint != null ? rewardHint : rewardDurationFromCheckinToday(false);

  return {
    id: row.id,
    status: row.status,
    board: board || emptyBoard(),
    score: Number(row.score) || 0,
    won: Boolean(row.won) || scoreReached || tileReached,
    rewardGranted: Boolean(row.rewardGranted),
    hasMoves,
    canClaim,
    winTile,
    minScore,
    gameOver: row.status === SESSION_ENDED || row.status === SESSION_CLAIMED || !hasMoves,
    rewardHashRate: game2048RewardHashRate(),
    rewardPowerDays: rd.rewardPowerDays,
    rewardPowerHours: rd.rewardPowerHours,
    powerDaysFull: game2048PowerDays(),
    startedAt: new Date(row.createdAt).toISOString(),
    endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null,
    timeLimitSeconds,
    secondsRemaining: secLeft
  };
}

/**
 * @param {number} userId
 * @param {Date} [now]
 */
export async function getGame2048Status(userId, now = new Date()) {
  const { cooldownEndsAt, active, rewardDuration } = await prisma.$transaction(async (tx) => {
    await lockUserFor2048(tx, userId);
    await expireStaleActiveSessions(tx, userId, now);

    const checkedInToday = await userHasConfirmedCheckinBrazilToday(tx, userId, now);
    const rewardDuration = rewardDurationFromCheckinToday(checkedInToday);

    const lastClaimed = await tx.game2048Session.findFirst({
      where: { userId, rewardGranted: true, rewardClaimedAt: { not: null } },
      orderBy: { rewardClaimedAt: "desc" }
    });
    const cd = computeCooldownEndsAt(lastClaimed?.rewardClaimedAt ?? null, now);

    let activeRow = await tx.game2048Session.findFirst({
      where: { userId, status: SESSION_ACTIVE },
      orderBy: { id: "desc" }
    });
    if (activeRow) {
      activeRow = await finalizeTimedOutSession(tx, activeRow, now);
    }

    return { cooldownEndsAt: cd, active: activeRow, rewardDuration };
  });

  const winTile = game2048WinTile();
  const minScore = game2048MinScore();

  const cdMs = game2048CooldownMs();
  const cooldownMinutesHint = cdMs > 0 ? Math.max(1, Math.ceil(cdMs / 60_000)) : 0;

  return {
    ok: true,
    allowNewStart: !cooldownEndsAt && !active,
    cooldownEndsAt: cooldownEndsAt ? cooldownEndsAt.toISOString() : null,
    cooldownSecondsRemaining: cooldownEndsAt
      ? Math.max(0, Math.ceil((cooldownEndsAt.getTime() - now.getTime()) / 1000))
      : 0,
    activeSession: active ? serializeSession(active, now, rewardDuration) : null,
    rewardHashRate: game2048RewardHashRate(),
    winTile,
    minScore,
    powerDays: game2048PowerDays(),
    rewardPowerDays: rewardDuration.rewardPowerDays,
    rewardPowerHours: rewardDuration.rewardPowerHours,
    powerDaysFull: game2048PowerDays(),
    cooldownMinutesHint
  };
}

/**
 * @param {number} userId
 * @param {Date} [now]
 */
export async function startGame2048Session(userId, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await lockUserFor2048(tx, userId);
    await expireStaleActiveSessions(tx, userId, now);

    const checkedInToday = await userHasConfirmedCheckinBrazilToday(tx, userId, now);
    const rd = rewardDurationFromCheckinToday(checkedInToday);

    const lastClaimed = await tx.game2048Session.findFirst({
      where: { userId, rewardGranted: true, rewardClaimedAt: { not: null } },
      orderBy: { rewardClaimedAt: "desc" }
    });
    const cd = computeCooldownEndsAt(lastClaimed?.rewardClaimedAt ?? null, now);
    if (cd) {
      return {
        ok: false,
        code: "COOLDOWN_ACTIVE",
        status: 429,
        cooldownEndsAt: cd.toISOString(),
        cooldownSecondsRemaining: Math.max(0, Math.ceil((cd.getTime() - now.getTime()) / 1000))
      };
    }

    let existing = await tx.game2048Session.findFirst({
      where: { userId, status: SESSION_ACTIVE },
      orderBy: { id: "desc" }
    });
    if (existing) {
      existing = await finalizeTimedOutSession(tx, existing, now);
    }
    if (existing && existing.status === SESSION_ACTIVE) {
      return {
        ok: true,
        reused: true,
        session: serializeSession(existing, now, rd)
      };
    }

    const board = createInitialBoard();
    const row = await tx.game2048Session.create({
      data: {
        userId,
        status: SESSION_ACTIVE,
        board,
        score: 0,
        won: false,
        rewardGranted: false
      }
    });

    return {
      ok: true,
      reused: false,
      session: serializeSession(row, now, rd)
    };
  });
}

/**
 * Forfeits any active round and starts a fresh board (same rules as start; no reward).
 * @param {number} userId
 * @param {Date} [now]
 */
export async function restartGame2048Session(userId, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await lockUserFor2048(tx, userId);
    await expireStaleActiveSessions(tx, userId, now);

    const checkedInToday = await userHasConfirmedCheckinBrazilToday(tx, userId, now);
    const rd = rewardDurationFromCheckinToday(checkedInToday);

    const lastClaimed = await tx.game2048Session.findFirst({
      where: { userId, rewardGranted: true, rewardClaimedAt: { not: null } },
      orderBy: { rewardClaimedAt: "desc" }
    });
    const cd = computeCooldownEndsAt(lastClaimed?.rewardClaimedAt ?? null, now);
    if (cd) {
      return {
        ok: false,
        code: "COOLDOWN_ACTIVE",
        status: 429,
        cooldownEndsAt: cd.toISOString(),
        cooldownSecondsRemaining: Math.max(0, Math.ceil((cd.getTime() - now.getTime()) / 1000))
      };
    }

    const active = await tx.game2048Session.findFirst({
      where: { userId, status: SESSION_ACTIVE },
      orderBy: { id: "desc" }
    });
    if (active) {
      await tx.game2048Session.update({
        where: { id: active.id },
        data: { status: SESSION_ENDED, endedAt: now }
      });
    }

    const board = createInitialBoard();
    const row = await tx.game2048Session.create({
      data: {
        userId,
        status: SESSION_ACTIVE,
        board,
        score: 0,
        won: false,
        rewardGranted: false
      }
    });

    return { ok: true, session: serializeSession(row, now, rd) };
  });
}

/**
 * @param {number} userId
 * @param {number} sessionId
 * @param {"up"|"down"|"left"|"right"} direction
 * @param {Date} [now]
 */
export async function applyGame2048Move(userId, sessionId, direction, now = new Date()) {
  const sid = Math.floor(Number(sessionId));
  if (!sid) {
    return { ok: false, code: "INVALID_SESSION", status: 400 };
  }

  return prisma.$transaction(async (tx) => {
    await lockUserFor2048(tx, userId);
    await expireStaleActiveSessions(tx, userId, now);

    const checkedInToday = await userHasConfirmedCheckinBrazilToday(tx, userId, now);
    const rd = rewardDurationFromCheckinToday(checkedInToday);

    let row = await tx.game2048Session.findFirst({
      where: { id: sid, userId }
    });
    if (!row) {
      return { ok: false, code: "SESSION_NOT_FOUND", status: 404 };
    }
    row = await finalizeTimedOutSession(tx, row, now);
    if (row.status !== SESSION_ACTIVE) {
      return { ok: false, code: "SESSION_NOT_ACTIVE", status: 409, session: serializeSession(row, now, rd) };
    }

    const board = boardFromRow(row.board);
    if (!board) {
      return { ok: false, code: "INVALID_BOARD", status: 500 };
    }

    const { board: afterMove, scoreDelta, moved } = moveBoard(board, direction);
    if (!moved) {
      game2048Log.debug("game2048_move_noop", {
        userId,
        sessionId: sid,
        direction,
        score: Number(row.score) || 0
      });
      return {
        ok: true,
        moved: false,
        session: serializeSession(row, now, rd)
      };
    }

    const nextBoard = afterMove;
    spawnRandomTile(nextBoard);
    const nextScore = (Number(row.score) || 0) + scoreDelta;
    const winTile = game2048WinTile();
    const minScore = game2048MinScore();
    const won = Boolean(row.won) || maxTile(nextBoard) >= winTile || nextScore >= minScore;
    let nextStatus = SESSION_ACTIVE;
    let endedAt = row.endedAt;
    if (won) {
      nextStatus = SESSION_ENDED;
      endedAt = now;
    } else if (!hasValidMove(nextBoard)) {
      nextStatus = SESSION_ENDED;
      endedAt = now;
    }

    const updated = await tx.game2048Session.update({
      where: { id: row.id },
      data: {
        board: nextBoard,
        score: nextScore,
        won,
        status: nextStatus,
        endedAt
      }
    });

    game2048Log.info("game2048_move_applied", {
      userId,
      sessionId: sid,
      direction,
      scoreDelta,
      scoreAfter: nextScore,
      maxTileAfter: maxTile(nextBoard),
      won,
      status: nextStatus
    });

    return {
      ok: true,
      moved: true,
      session: serializeSession(updated, now, rd)
    };
  });
}

/**
 * @param {number} userId
 * @param {number} sessionId
 * @param {object} [meta]
 * @param {string | null} [meta.ip]
 * @param {string | null} [meta.userAgent]
 * @param {Date} [now]
 */
export async function claimGame2048Reward(userId, sessionId, meta = {}, now = new Date()) {
  const sid = Math.floor(Number(sessionId));
  if (!sid) {
    return { ok: false, code: "INVALID_SESSION", status: 400 };
  }

  const minScore = game2048MinScore();
  const winTile = game2048WinTile();
  const rewardHr = game2048RewardHashRate();
  const powerDaysFull = game2048PowerDays();

  const result = await prisma.$transaction(async (tx) => {
    await lockUserFor2048(tx, userId);
    await expireStaleActiveSessions(tx, userId, now);

    const checkedInToday = await userHasConfirmedCheckinBrazilToday(tx, userId, now);
    const rd = rewardDurationFromCheckinToday(checkedInToday);

    const row = await tx.game2048Session.findFirst({
      where: { id: sid, userId }
    });
    if (!row) {
      return { ok: false, code: "SESSION_NOT_FOUND", status: 404 };
    }

    if (row.rewardGranted) {
      const lastClaimed = await tx.game2048Session.findFirst({
        where: { userId, rewardGranted: true, rewardClaimedAt: { not: null } },
        orderBy: { rewardClaimedAt: "desc" }
      });
      const cd = computeCooldownEndsAt(lastClaimed?.rewardClaimedAt ?? null, now);
      return {
        ok: true,
        idempotent: true,
        rewardHashRate: rewardHr,
        powerDays: powerDaysFull,
        rewardPowerDays: rd.rewardPowerDays,
        rewardPowerHours: rd.rewardPowerHours,
        nextClaimAllowedAt: cd ? cd.toISOString() : null,
        cooldownSecondsRemaining: cd ? Math.max(0, Math.ceil((cd.getTime() - now.getTime()) / 1000)) : 0
      };
    }

    const board = boardFromRow(row.board);
    const maxT = board ? maxTile(board) : 0;
    const scoreOk = (Number(row.score) || 0) >= minScore;
    const tileOk = maxT >= winTile;
    if (!scoreOk && !tileOk) {
      return { ok: false, code: "SCORE_TOO_LOW", status: 400 };
    }

    if (row.status === SESSION_ACTIVE) {
      return { ok: false, code: "SESSION_NOT_FINISHED", status: 400 };
    }

    const lastClaimed = await tx.game2048Session.findFirst({
      where: {
        userId,
        rewardGranted: true,
        rewardClaimedAt: { not: null },
        id: { not: row.id }
      },
      orderBy: { rewardClaimedAt: "desc" }
    });
    const cdOther = computeCooldownEndsAt(lastClaimed?.rewardClaimedAt ?? null, now);
    if (cdOther) {
      return {
        ok: false,
        code: "COOLDOWN_ACTIVE",
        status: 429,
        cooldownEndsAt: cdOther.toISOString(),
        cooldownSecondsRemaining: Math.max(0, Math.ceil((cdOther.getTime() - now.getTime()) / 1000))
      };
    }

    const gameId = await getOrCreateGame2048GameId(tx);
    const playedAt = now;
    const expiresAt = new Date(playedAt.getTime() + rd.rewardTtlMs);

    const powerRow = await tx.userPowerGame.create({
      data: {
        userId,
        gameId,
        hashRate: rewardHr,
        playedAt,
        expiresAt
      }
    });

    await tx.game2048Session.update({
      where: { id: row.id },
      data: {
        status: SESSION_CLAIMED,
        rewardGranted: true,
        rewardClaimedAt: playedAt,
        endedAt: row.endedAt ?? playedAt
      }
    });

    game2048Log.info("game2048_reward_claimed", {
      userId,
      sessionId: row.id,
      score: Number(row.score) || 0,
      winTile,
      rewardHashRate: rewardHr,
      userPowerGameId: powerRow.id
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: "game2048_claim",
        ip: meta.ip ? String(meta.ip).slice(0, 64) : null,
        userAgent: meta.userAgent ? String(meta.userAgent).slice(0, 512) : null,
        detailsJson: JSON.stringify({
          sessionId: row.id,
          winTile,
          score: row.score,
          hashRate: rewardHr,
          expiresAt: expiresAt.toISOString()
        })
      }
    });

    const cd = game2048CooldownMs() > 0 ? new Date(playedAt.getTime() + game2048CooldownMs()) : null;
    return {
      ok: true,
      idempotent: false,
      rewardHashRate: rewardHr,
      powerDays: powerDaysFull,
      rewardPowerDays: rd.rewardPowerDays,
      rewardPowerHours: rd.rewardPowerHours,
      userPowerGameId: powerRow.id,
      nextClaimAllowedAt: cd ? cd.toISOString() : null,
      cooldownSecondsRemaining: cd ? Math.max(0, Math.ceil((cd.getTime() - now.getTime()) / 1000)) : 0
    };
  });

  if (result.ok && !result.idempotent && result.userPowerGameId) {
    notifyMiniPassGamePlayed(userId, {
      userPowerGameId: result.userPowerGameId,
      gameSlug: GAME2048_GAME_SLUG
    }).catch(() => {});
    notifyDailyTaskGamePlayed(userId, {
      userPowerGameId: result.userPowerGameId,
      gameSlug: GAME2048_GAME_SLUG
    }).catch(() => {});
    try {
      const newTotal = await syncUserBaseHashRate(userId);
      const engine = getMiningEngine();
      if (engine) {
        const miner = engine.findMinerByUserId(userId);
        if (miner) miner.baseHashRate = newTotal;
        if (engine.io) engine.io.to(`user:${userId}`).emit("machines:update");
      }
    } catch {
      /* non-fatal */
    }
  }

  return result;
}
