import type { Socket } from "socket.io";
import type { MiningEngine } from "../../miningEngine.js";
import loggerLib from "../../../utils/logger.js";
import type { SkyRunnerState } from "./games-socket.types.js";
import {
  SKY_CHECKPOINT_EVERY_PIPES, SKY_LIVES, SKY_MIN_FLAP_INTERVAL_MS, SKY_TARGET_PIPES,
} from "./games-socket.constants.js";
import { skyMinElapsedMsForPipes } from "./games-socket.constants.js";
import { finishGame } from "./finish-game.socket.js";

const logger = loggerLib.child("GamesSocket");

export function handleSkyRunnerFlap(state: SkyRunnerState) {
  const now = Date.now();
  if (now - (state.lastFlapAt || 0) < SKY_MIN_FLAP_INTERVAL_MS) return;
  state.lastFlapAt = now;
}

export function readClampedNumber(raw: unknown, min: number, max: number): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

export function handleSkyRunnerCheckpoint(
  socket: Socket,
  state: SkyRunnerState,
  action: { type: "checkpoint"; pipesPassed?: unknown; elapsedMs?: unknown; lives?: unknown; score?: unknown },
  engine: MiningEngine
) {
  const pipesPassed = readClampedNumber(action.pipesPassed, 0, SKY_TARGET_PIPES);
  const elapsedMs = readClampedNumber(action.elapsedMs, 0, 30 * 60 * 1000); // ≤30 min
  const lives = readClampedNumber(action.lives, 0, SKY_LIVES);
  const score = readClampedNumber(action.score, 0, SKY_TARGET_PIPES * 1000);
  if (pipesPassed === null || elapsedMs === null || lives === null || score === null) return;

  // Monotonicity: pipesPassed can only go up
  if (pipesPassed < state.pipesPassed) return;

  // Physics check: must take at least the minimum theoretical time to reach
  // pipesPassed. If it claims more pipes than possible in elapsedMs → cheat.
  const minMs = skyMinElapsedMsForPipes(pipesPassed);
  if (elapsedMs < minMs) {
    logger.warn(`sky-runner: checkpoint rejected (impossible timing). user=${state.userId} pipes=${pipesPassed} elapsedMs=${elapsedMs} minMs=${minMs}`);
    socket.emit("game:error", { code: "checkpoint_rejected" });
    finishGame(socket, state, false, engine, "sky_cheat_timing");
    return;
  }

  state.pipesPassed = pipesPassed;
  state.lastCheckpointMs = elapsedMs;
  state.lives = lives;
  state.score = score;
  socket.emit("sky:checkpoint_ack", { pipesPassed, lives });
}

export function handleSkyRunnerFinish(
  socket: Socket,
  state: SkyRunnerState,
  action: { type: "finish"; pipesPassed?: unknown; elapsedMs?: unknown; score?: unknown },
  engine: MiningEngine
) {
  const pipesPassed = readClampedNumber(action.pipesPassed, 0, SKY_TARGET_PIPES);
  const elapsedMs = readClampedNumber(action.elapsedMs, 0, 30 * 60 * 1000);
  const score = readClampedNumber(action.score, 0, SKY_TARGET_PIPES * 1000);
  if (pipesPassed === null || elapsedMs === null || score === null) {
    return finishGame(socket, state, false, engine, "sky_finish_invalid");
  }

  // Validate timing against the physics-minimum
  const minMs = skyMinElapsedMsForPipes(pipesPassed);
  if (elapsedMs < minMs) {
    logger.warn(`sky-runner: finish rejected (impossible timing). user=${state.userId} pipes=${pipesPassed} elapsedMs=${elapsedMs} minMs=${minMs}`);
    return finishGame(socket, state, false, engine, "sky_cheat_timing");
  }

  state.pipesPassed = pipesPassed;
  state.lastCheckpointMs = elapsedMs;
  state.score = score;

  const won = pipesPassed >= SKY_TARGET_PIPES;
  finishGame(socket, state, won, engine, won ? "sky_won" : "sky_lost");
}
