/**
 * Progressive cooldown engine — DB-backed, survives server restarts.
 *
 * Progression: base 10s, +10s per 10 completed sessions, cap 300s.
 * Recovery:    after 6h idle (from lastFinishedAt), subtract 10s per 6h elapsed,
 *              applied lazily on next game:start.
 */
import prisma from "../../src/db/prisma.js";

const BASE_COOLDOWN_S = 10;
const STEP_S = 10;        // added per tier
const TIER_SIZE = 10;     // sessions per tier
const MAX_COOLDOWN_S = 300;
const RECOVERY_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 h
const RECOVERY_STEP_S = 10;

function computeCooldownSeconds(sessions: number): number {
  const tier = Math.floor(sessions / TIER_SIZE);
  return Math.min(BASE_COOLDOWN_S + tier * STEP_S, MAX_COOLDOWN_S);
}

function applyRecovery(sessions: number, lastFinishedAt: Date | null, now: Date): number {
  if (!lastFinishedAt || sessions <= 0) return sessions;
  const idleMs = now.getTime() - lastFinishedAt.getTime();
  if (idleMs < RECOVERY_INTERVAL_MS) return sessions;
  const recoverySteps = Math.floor(idleMs / RECOVERY_INTERVAL_MS) - 1; // first 6h is grace
  if (recoverySteps <= 0) return sessions;
  const recoveredS = recoverySteps * RECOVERY_STEP_S;
  // Convert recovered seconds back to session equivalents (inverse of cooldown formula)
  const currentCooldownS = computeCooldownSeconds(sessions);
  const newCooldownS = Math.max(BASE_COOLDOWN_S, currentCooldownS - recoveredS);
  // Derive sessions that would produce newCooldownS
  const newTier = Math.floor((newCooldownS - BASE_COOLDOWN_S) / STEP_S);
  return Math.max(0, newTier * TIER_SIZE);
}

/**
 * Check if user is still in cooldown for a given game.
 * Returns null if OK to play, or { remainingSeconds } if blocked.
 * Also applies lazy recovery and persists the updated state.
 */
export async function checkCooldown(
  userId: number,
  gameSlug: string,
): Promise<{ remainingSeconds: number } | null> {
  const now = new Date();

  const state = await prisma.gameCooldownState.findUnique({
    where: { userId_gameSlug: { userId, gameSlug } },
  });

  if (!state) return null;

  // Apply lazy recovery
  const recoveredSessions = applyRecovery(state.sessions, state.lastFinishedAt, now);
  if (recoveredSessions !== state.sessions) {
    await prisma.gameCooldownState.update({
      where: { id: state.id },
      data: { sessions: recoveredSessions },
    });
  }

  if (!state.cooldownEndsAt) return null;
  const remaining = state.cooldownEndsAt.getTime() - now.getTime();
  if (remaining <= 0) return null;
  return { remainingSeconds: Math.ceil(remaining / 1000) };
}

/**
 * Record a completed game session and advance the cooldown state.
 * Call this only after a confirmed successful finish.
 */
export async function recordFinish(userId: number, gameSlug: string): Promise<void> {
  const now = new Date();

  const existing = await prisma.gameCooldownState.findUnique({
    where: { userId_gameSlug: { userId, gameSlug } },
  });

  const currentSessions = existing
    ? applyRecovery(existing.sessions, existing.lastFinishedAt, now)
    : 0;

  const newSessions = currentSessions + 1;
  const cooldownS = computeCooldownSeconds(newSessions);
  const cooldownEndsAt = new Date(now.getTime() + cooldownS * 1000);

  await prisma.gameCooldownState.upsert({
    where: { userId_gameSlug: { userId, gameSlug } },
    create: { userId, gameSlug, sessions: newSessions, lastFinishedAt: now, cooldownEndsAt },
    update: { sessions: newSessions, lastFinishedAt: now, cooldownEndsAt },
  });
}

/**
 * Get the current effective cooldown seconds for a user+game (for display).
 */
export async function getCooldownSeconds(userId: number, gameSlug: string): Promise<number> {
  const state = await prisma.gameCooldownState.findUnique({
    where: { userId_gameSlug: { userId, gameSlug } },
  });
  if (!state) return BASE_COOLDOWN_S;
  const sessions = applyRecovery(state.sessions, state.lastFinishedAt, new Date());
  return computeCooldownSeconds(sessions + 1); // next session's cooldown
}
