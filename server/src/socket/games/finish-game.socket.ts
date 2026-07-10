import type { Socket } from "socket.io";
import prisma from "../../db/prisma.js";
import loggerLib from "../../../utils/logger.js";
import { syncUserBaseHashRate } from "../../../models/minerProfileModel.js";
import { getBrazilDateKeyAliases } from "../../../utils/checkinDate.js";
import { notifyMiniPassGamePlayed } from "../../../services/miniPass/miniPassMissionHookService.js";
import { notifyDailyTaskGamePlayed } from "../../../services/dailyTasks/dailyTaskHookService.js";
import { createAuditLogBestEffort } from "../../../models/auditLogModel.js";
import { errMsg } from "../../../types/tsNarrowing.js";
import type { MiningEngine } from "../../miningEngine.js";
import { checkCooldown, recordFinish } from "../../../modules/games/gameCooldownEngine.js";
import { evaluateCartRushTrust, evaluateTrust } from "../../../modules/games/gameAntiCheatV2.js";
import { releaseUserGameSession } from "../../../modules/games/gameActiveSessionLock.js";
import { flagMinigameBurstIfNeeded } from "../../../modules/games/gameBurstGuard.js";
import { recordTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "../../../modules/tournaments/application/tournament-action-dispatch.js";
import type { CartRushState, GameSessionState } from "./games-socket.types.js";
import { GAME_POWER_DAYS, GAME_SESSIONS } from "./games-socket.constants.js";
import { clearMemoryMismatchTimer } from "./shared.socket.js";

const logger = loggerLib.child("GamesSocket");

export async function finishGame(
  socket: Socket,
  state: GameSessionState,
  success: boolean,
  engine: MiningEngine,
  failureCode = "session_ended"
) {
  if (state.isFinished) return;
  clearMemoryMismatchTimer(state);
  state.isFinished = true;
  GAME_SESSIONS.delete(socket.id);

  const wallPlayTimeMs = Date.now() - state.startTime;
  const userId = Number(state.userId);
  const gameSlug = String(state.slug || "");
  releaseUserGameSession(userId, gameSlug, socket.id);
  const playTimeMs =
    gameSlug === "cart-rush"
      ? Math.max(wallPlayTimeMs, Number((state as CartRushState).elapsedMs) || 0)
      : wallPlayTimeMs;
  const score = Number(state.score || 0);
  const ip = socket.handshake?.address || socket.request?.socket?.remoteAddress || null;
  const userAgent = (socket.request?.headers?.["user-agent"] as string | undefined) || null;

  if (success) {
    // Anti-cheat V2: trust score evaluation
    const trust =
      gameSlug === "cart-rush"
        ? evaluateCartRushTrust(
            playTimeMs,
            Number((state as CartRushState).distance) || 0,
            Number((state as CartRushState).btcCount) || 0,
            score,
          )
        : evaluateTrust(gameSlug, playTimeMs, score);

    if (trust.rejected) {
      logger.warn(`[AntiCheat] Rejected userId=${userId} game=${gameSlug} playTimeMs=${playTimeMs} trustScore=${trust.trustScore} events=${trust.events.join(",")}`);

      prisma.gameSessionLog.create({
        data: { userId, gameSlug, gameId: Number(state.gameId) || null, success: false, score, playTimeMs, failReason: `anticheat:${trust.events.join(",")}`, trustScore: trust.trustScore, rewardGranted: false, ip, userAgent },
      }).catch(() => {});

      // Still advance cooldown so abusers get longer waits
      recordFinish(userId, gameSlug).catch(() => {});

      const nextCooldown = 30; // fixed short cooldown after rejection
      return socket.emit("game:finished", {
        success: false,
        messageCode: "anti_cheat_timing",
        cooldownSeconds: nextCooldown,
      });
    }

    // Verifica se o usuário fez check-in hoje — sem check-in bônus dura só 24h
    const checkinToday = await prisma.dailyCheckin.findFirst({
      where: {
        userId,
        status: "confirmed",
        checkinDate: { in: getBrazilDateKeyAliases() }
      },
      select: { id: true },
      orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }]
    });
    const powerDays = checkinToday ? GAME_POWER_DAYS : 1;
    const rewardCode = powerDays >= GAME_POWER_DAYS ? "full_term" : "short_term";
    const rewardParams = { days: GAME_POWER_DAYS };

    const expiresAt = new Date(Date.now() + powerDays * 24 * 60 * 60 * 1000);
    try {
      await flagMinigameBurstIfNeeded(userId, gameSlug, { ip, userAgent, score, playTimeMs });

      const powerRow = await prisma.userPowerGame.create({
        data: {
          userId,
          gameId: Number(state.gameId),
          hashRate: 25.0,
          playedAt: new Date(),
          expiresAt
        }
      });

      // Advance progressive cooldown
      await recordFinish(userId, gameSlug);

      prisma.gameSessionLog.create({
        data: { userId, gameSlug, gameId: Number(state.gameId) || null, success: true, score, playTimeMs, trustScore: trust.trustScore, rewardGranted: true, ip, userAgent },
      }).catch(() => {});

      notifyMiniPassGamePlayed(userId, {
        userPowerGameId: powerRow.id,
        gameSlug,
      }).catch(() => {});
      notifyDailyTaskGamePlayed(userId, {
        userPowerGameId: powerRow.id,
        gameSlug,
      }).catch(() => {});
      void recordTournamentAction({
        userId,
        provider: TOURNAMENT_ACTION_PROVIDER.MINIGAME,
        actionCount: 1,
        executedAtUTC: powerRow.playedAt instanceof Date ? powerRow.playedAt : new Date(),
        providerEventId: `upg:${powerRow.id}`,
        metadata: {
          gameSlug,
          userPowerGameId: powerRow.id,
          score,
        },
      }).catch((err) => {
        logger.warn(`tournament minigame action failed userId=${userId} upg=${powerRow.id}: ${errMsg(err)}`);
      });
      createAuditLogBestEffort({
        userId,
        action: "MINIGAME_PLAYED_REWARD",
        ip,
        userAgent,
        details: { gameSlug, score, success: true, rewardHashRate: 25, rewardDays: powerDays, userPowerGameId: powerRow.id }
      }).catch(() => {});

      const total = await syncUserBaseHashRate(userId);
      const miner = engine.miners.get(userId.toString());
      if (miner) miner.baseHashRate = total;

      // Fetch next cooldown for client display
      const cooldownResult = await checkCooldown(userId, gameSlug);
      const cooldownSeconds = cooldownResult?.remainingSeconds ?? 10;

      socket.emit("game:finished", {
        success: true,
        rewardCode,
        rewardParams,
        cooldownSeconds,
      });
      socket.emit("machines:update");
    } catch (e) {
      socket.emit("game:finished", {
        success: true,
        rewardCode: "persist_ok",
        cooldownSeconds: 10,
      });
    }
  } else {
    prisma.gameSessionLog.create({
      data: { userId, gameSlug, gameId: Number(state.gameId) || null, success: false, score, playTimeMs, failReason: failureCode, rewardGranted: false, ip, userAgent },
    }).catch(() => {});

    createAuditLogBestEffort({
      userId,
      action: "MINIGAME_PLAYED_FAILED",
      ip,
      userAgent,
      details: { gameSlug, score, success: false, reason: failureCode }
    }).catch(() => {});

    socket.emit("game:finished", {
      success: false,
      messageCode: failureCode,
      cooldownSeconds: 10,
    });
  }
}
