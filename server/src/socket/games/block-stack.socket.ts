import type { Socket } from "socket.io";
import type { MiningEngine } from "../../miningEngine.js";
import type { BlockStackState } from "./games-socket.types.js";
import {
  STACK_DROP_MIN_INTERVAL_MS, STACK_INITIAL_WIDTH, STACK_MIN_WIDTH, STACK_PLAY_WIDTH,
  STACK_TARGET_BLOCKS, STACK_TRAVEL_DECAY_PER_BLOCK, STACK_TRAVEL_MS_INITIAL, STACK_TRAVEL_MS_MIN,
} from "./games-socket.constants.js";
import { finishGame } from "./finish-game.socket.js";

export function handleBlockStackDrop(socket: Socket, state: BlockStackState, engine: MiningEngine) {
  const now = Date.now();
  if (now - (state.lastDropAt || 0) < STACK_DROP_MIN_INTERVAL_MS) return;
  state.lastDropAt = now;

  // Block oscillates left↔right; logical position = triangle wave of elapsed time.
  // We use a ping-pong: phase ∈ [0,1] → distance from left edge.
  const elapsed = Math.max(0, now - state.blockStartedAt);
  const travel = Math.max(STACK_TRAVEL_MS_MIN, state.currentTravelMs);
  const cyclePos = (elapsed % (travel * 2)) / travel; // 0..2
  const phase = cyclePos <= 1 ? cyclePos : 2 - cyclePos; // ping-pong 0..1..0
  const maxLeft = STACK_PLAY_WIDTH - state.currentWidth;
  const blockLeft = phase * maxLeft;

  // Compute overlap against the tower base
  const baseLeft = state.baseLeftPx;
  const baseRight = baseLeft + state.currentWidth; // tower base width = previous block width
  const blockRight = blockLeft + state.currentWidth;
  const overlapLeft = Math.max(baseLeft, blockLeft);
  const overlapRight = Math.min(baseRight, blockRight);
  const overlapWidth = Math.max(0, overlapRight - overlapLeft);

  if (overlapWidth < STACK_MIN_WIDTH) {
    // Missed entirely (or too narrow) → end run without reward
    socket.emit("game:stack_dropped", {
      blocksPlaced: state.blocksPlaced,
      score: state.score,
      blockLeft,
      blockWidth: state.currentWidth,
      overlapWidth,
      missed: true
    });
    return finishGame(socket, state, false, engine, "stack_missed");
  }

  // Successful stack
  state.blocksPlaced += 1;
  state.score += 100 + Math.floor(overlapWidth);
  state.baseLeftPx = overlapLeft;
  state.currentWidth = overlapWidth;
  // Next block travels faster (clamped) and starts NOW with the new width
  state.currentTravelMs = Math.max(
    STACK_TRAVEL_MS_MIN,
    state.currentTravelMs - STACK_TRAVEL_DECAY_PER_BLOCK
  );
  state.blockStartedAt = now;

  socket.emit("game:stack_dropped", {
    blocksPlaced: state.blocksPlaced,
    score: state.score,
    blockLeft,
    blockWidth: overlapWidth,
    overlapWidth,
    missed: false,
    nextBlock: {
      width: overlapWidth,
      travelMs: state.currentTravelMs,
      startedAt: state.blockStartedAt
    },
    base: { leftPx: state.baseLeftPx, width: overlapWidth }
  });

  if (state.blocksPlaced >= STACK_TARGET_BLOCKS) {
    finishGame(socket, state, true, engine);
  }
}

// ─── Sky Runner: server-authoritative Flappy-style airplane ──────────────────
//
// Anti-cheat rationale:
//  - The server owns Y, VY, pipe layout, scroll speed, score, and collisions.
//    The client cannot lie about its position — it doesn't have a position to
//    lie about. It only sends `{type:"flap"}`.
//  - Flap rate-limit (SKY_MIN_FLAP_INTERVAL_MS = 90ms) rejects autoclicker
//    spam. A spam flap pattern is also self-defeating: rapid flaps push the
//    plane straight into the top edge, which the server detects as collision.
//  - The pipe gap geometry is generated server-side via crypto.randomInt and
//    only revealed when the pipe enters the visible window. A predictive bot
//    would still need to time flaps within the 90ms gate.
//  - 15s minimum playtime is naturally satisfied (20 pipes × ~1.55s = ~24s).

// Server's only role for flap is rate-limit telemetry — the client runs the
// actual physics. We could even skip this entirely, but keeping it lets us
// audit suspicious clients (e.g. someone modifying the JS to remove the
