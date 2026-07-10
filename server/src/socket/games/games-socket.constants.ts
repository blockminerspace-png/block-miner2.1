import { getMemoryMismatchRevealMs } from "../../../utils/memoryGameConstants.js";
import type { GameSessionState } from "./games-socket.types.js";

export const GAME_SESSIONS = new Map<string, GameSessionState>();
export const GAME_NAMES = {
  "crypto-memory": "Memory Sync",
  "crypto-match-3": "Power Match",
  "cart-rush": "Cart Rush",
  "block-stack": "Block Stack",
  "sky-runner": "Sky Runner"
};

export const GAME_POWER_DAYS = Number(process.env.GAME_POWER_DAYS) || 7;
/** Time for the client flip-open animation to settle so both cards are fully visible. */
const MEMORY_FLIP_OPEN_SETTLE_MS = 320;
const MEMORY_MISMATCH_HOLD_MS = getMemoryMismatchRevealMs();
export const MEMORY_MISMATCH_TOTAL_MS = MEMORY_FLIP_OPEN_SETTLE_MS + MEMORY_MISMATCH_HOLD_MS;

export const SYMBOLS = ["bitcoin", "ethereum", "solana", "binance-coin", "cardano", "polkadot", "dogecoin", "polygon"];
export const MATCH3_SYMBOLS = ["bitcoin", "ethereum", "solana", "binance-coin", "cardano"];
export const CART_LANES = 3;
export const CART_TICK_MS = 200;
export const CART_TARGET_SCORE = 250;
export const CART_TIME_LIMIT_SECONDS = 120;
export const CART_MAX_HEALTH = 3;
export const CART_COLLISION_PROGRESS = 0.70;
export const CART_DESPAWN_PROGRESS = 1.18;
export const CART_DIFFICULTY_RAMP_MS = 90000;
export const CART_BASE_SPEED = 0.35;
export const CART_MAX_SPEED = 0.65;
export const CART_BASE_SPAWN_MS = 1200;
export const CART_MIN_SPAWN_MS = 500;
export const CART_DISTANCE_PER_TICK = 10;
export const CART_COIN_POINTS = 50;
export const GAME_SLUG_MAX_LEN = 64;

// ─── Block Stack constants ───────────────────────────────────────────────────
// Server emits block-spawn events; client only animates locally. The server
// authoritatively decides where the block is at the moment of the `drop`
// action by recomputing position from (server time received - blockStartedAt).
export const STACK_TARGET_BLOCKS = 8;            // Win condition: 8 successful stacks (was 10)
export const STACK_INITIAL_WIDTH = 200;          // Much wider starting block (was 120) — much more forgiving
export const STACK_TRAVEL_MS_INITIAL = 2600;     // Slower start (was 2200)
export const STACK_TRAVEL_MS_MIN = 1200;         // Slower top speed (was 950) — endgame still readable
export const STACK_TRAVEL_DECAY_PER_BLOCK = 200; // Bigger steps but fewer blocks (was 140 × 10)
// Min run sum: 2600+2400+2200+2000+1800+1600+1400+1200 = 15.2s ≥ 15s anti-cheat floor.
export const STACK_PLAY_WIDTH = 480;             // Logical play-area width (unchanged)
export const STACK_MIN_WIDTH = 28;               // Larger forgiveness margin (was 18) — easier to "graze" successfully
export const STACK_DROP_MIN_INTERVAL_MS = 250;   // Anti-flood: max ~4 drops/s

// ─── Sky Runner constants ────────────────────────────────────────────────────
// Flappy-Bird-style game with a tiny airplane navigating between pipe gaps.
// The server is fully authoritative: it ticks the world, applies gravity to
// the player's Y position, spawns pipe pairs at fixed intervals, and runs
// collision/score detection. The client only sends one action: `{type:"flap"}`.
// That gives us strong anti-cheat — no client-side score, no client position.
// ─── Sky Runner — client-authoritative physics with seeded validation ────────
//
// The previous design (server tick loop, client interpolates snapshots) was
// inherently delayed: input had to wait for the next server tick to be
// reflected, and the client could only render snapshots already at least one
// RTT old. For a twitch game like Flappy Bird that feels awful.
//
// New design:
//  - The server is a "validator", not a tick engine. It signs the run with
//    a random PRNG seed and ships all physics constants to the client.
//  - The client runs the full simulation (gravity, scroll, pipes, collision)
//    in a rAF loop. Input → physics → render happens locally in under 1 frame.
//  - Pipes are generated deterministically from the seed (same PRNG on both
//    sides). The server can reproduce the exact pipe layout at any point in
//    time, so it can audit checkpoints.
//
// Anti-cheat layers:
//  - The total run duration is bounded by the scroll speed × pipe spacing:
//    a run that reports SKY_TARGET_PIPES passed in <SKY_MIN_RUN_MS is rejected.
//  - The client reports progress checkpoints (`sky:checkpoint`) every N pipes.
//    Each checkpoint includes pipesPassed + elapsedMs + lives. We verify the
//    elapsed time is consistent with the minimum possible scroll distance to
//    pass that many pipes (impossible to "skip" pipes by lying — you'd have
//    to claim them faster than physics allows, which we detect).
//  - A finish below the 15s floor still triggers the existing anti-cheat path
//    inside `finishGame`.
//  - Lives drained to 0 on the client → client emits `game:end` which finishes
//    the run as a loss. (No reward to extract from cheating into a loss.)
//  - To win, the client emits `sky:finish` with pipesPassed === target. The
//    server validates by checking the minimum elapsed time and the most
//    recent checkpoint.
export const SKY_WORLD_W = 600;
export const SKY_WORLD_H = 800;
export const SKY_PLANE_X = 140;
export const SKY_PLANE_RADIUS = 38;
export const SKY_GRAVITY = 1500;
export const SKY_FLAP_VY = -480;
export const SKY_MAX_VY = 800;
export const SKY_MIN_FLAP_INTERVAL_MS = 80;
export const SKY_PIPE_W = 90;
export const SKY_PIPE_GAP = 250;
export const SKY_PIPE_GAP_MIN = 190;
export const SKY_PIPE_SPAWN_DX = 300;
export const SKY_SCROLL_SPEED_BASE = 170;
export const SKY_SCROLL_SPEED_MAX = 260;
export const SKY_DIFFICULTY_RAMP_MS = 60000;
export const SKY_TARGET_PIPES = 15;
export const SKY_PIPE_MARGIN = 90;
export const SKY_LIVES = 3;
export const SKY_INVULN_MS = 1500;
export const SKY_CHECKPOINT_EVERY_PIPES = 5; // Client reports every 5 pipes
// Minimum theoretical time to pass N pipes: at max scroll speed (260 px/s) and
// minimum spacing (300px), each pipe still takes ≥300/260 ≈ 1.15s. We give
// some slack for floating-point and slight bursts.
export function skyMinElapsedMsForPipes(pipesPassed: number): number {
  // Avg max scroll speed is 260, plus initial pipe pre-queue at SKY_WORLD_W + 200
  // means the first pipe takes at least (SKY_WORLD_W + 200 - SKY_PLANE_X) / 260 ≈ 2.5s
  // and each subsequent pipe takes at least SKY_PIPE_SPAWN_DX / SKY_SCROLL_SPEED_MAX
  const firstPipeMs = ((SKY_WORLD_W + 200 - SKY_PLANE_X) / SKY_SCROLL_SPEED_MAX) * 1000;
  const perPipeMs = (SKY_PIPE_SPAWN_DX / SKY_SCROLL_SPEED_MAX) * 1000;
  if (pipesPassed <= 0) return 0;
  // 80% factor leaves slack for client-side scrolling that may briefly speed
  // up under heavy GC; we only reject blatantly impossible timing.
  return Math.floor((firstPipeMs + (pipesPassed - 1) * perPipeMs) * 0.8);
}

export const CART_ENEMY_VARIANTS = [
  { body: "#f97316", accent: "#fdba74", glow: "rgba(249,115,22,0.45)" },
  { body: "#ef4444", accent: "#fca5a5", glow: "rgba(239,68,68,0.45)" },
  { body: "#fb7185", accent: "#fecdd3", glow: "rgba(251,113,133,0.42)" }
];
