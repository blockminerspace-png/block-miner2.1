import crypto from "node:crypto";
import type { Socket } from "socket.io";
import type { MiningEngine } from "../../miningEngine.js";
import type { CartRushCartEvent, CartRushState, GameSessionState } from "./games-socket.types.js";
import {
  CART_BASE_SPAWN_MS, CART_BASE_SPEED, CART_MAX_SPEED, CART_MIN_SPAWN_MS, CART_COLLISION_PROGRESS, CART_COIN_POINTS,
  CART_DESPAWN_PROGRESS, CART_DIFFICULTY_RAMP_MS, CART_DISTANCE_PER_TICK,
  CART_LANES, CART_MAX_HEALTH, CART_TARGET_SCORE, CART_TICK_MS, CART_TIME_LIMIT_SECONDS,
  CART_ENEMY_VARIANTS,
} from "./games-socket.constants.js";
import { finishGame } from "./finish-game.socket.js";

export function cartDifficultyFactor(state) {
  const elapsedMs = Math.max(0, Number(state?.elapsedMs) || 0);
  return Math.min(1, elapsedMs / CART_DIFFICULTY_RAMP_MS);
}

export function createCartEvent(distance, difficulty) {
  const rand = Math.random();
  let kind = "enemy-car";
  let variant = CART_ENEMY_VARIANTS[crypto.randomInt(0, CART_ENEMY_VARIANTS.length)];
  let speed = CART_BASE_SPEED;

  if (rand < 0.25) {
    kind = "coin";
  } else if (rand < 0.45) {
    kind = "cone";
  } else if (rand < 0.55) {
    kind = "barrier";
  } else if (rand < 0.65) {
    kind = "pothole";
  } else {
    kind = "enemy-car";
    const speedRange = CART_MAX_SPEED - CART_BASE_SPEED;
    speed = CART_BASE_SPEED + speedRange * (0.45 + difficulty * 0.4 + Math.random() * 0.18);
  }

  // Obstacles and coins move at the road speed, enemy cars can have their own speed
  if (kind !== "enemy-car") {
    speed = 0; // It moves with the road (handled by state.roadSpeed in tick)
  }

  return {
    id: `${distance}-${crypto.randomUUID()}`,
    lane: crypto.randomInt(0, CART_LANES),
    kind,
    progress: 0,
    speed,
    variant
  };
}

export function tickCartRush(socket: Socket, state: GameSessionState, engine: MiningEngine) {
  if (!state || state.isFinished || state.slug !== "cart-rush") return;
  const s = state as CartRushState;
  const tickSeconds = CART_TICK_MS / 1000;
  s.distance = (Number(s.distance) || 0) + CART_DISTANCE_PER_TICK;
  s.elapsedMs = (Number(s.elapsedMs) || 0) + CART_TICK_MS;
  const difficulty = cartDifficultyFactor(s);
  s.roadSpeed = CART_BASE_SPEED + (CART_MAX_SPEED - CART_BASE_SPEED) * difficulty;
  s.events = (s.events || [])
    .map((event) => ({
      ...event,
      progress: Number(event.progress || 0) + Number(event.speed || s.roadSpeed) * tickSeconds
    }))
    .filter((event) => Number(event.progress || 0) <= CART_DESPAWN_PROGRESS);

  let hit: CartRushCartEvent | null = null;
  const survivors: CartRushCartEvent[] = [];
  for (const event of s.events) {
    if (Number(event.progress || 0) >= CART_COLLISION_PROGRESS) {
      if (!event.checked) {
        event.checked = true;
        if (event.lane === s.lane) {
          if (event.kind === "coin") {
            s.btcCount = (Number(s.btcCount) || 0) + 1;
          } else {
            hit = event;
            s.health -= 1;
          }
          continue;
        }
      }
    }
    survivors.push(event);
  }
  s.events = survivors;

  s.spawnCooldownMs = Math.max(0, Number(s.spawnCooldownMs || 0) - CART_TICK_MS);
  if (s.spawnCooldownMs <= 0) {
    s.events.push(createCartEvent(s.distance, difficulty));
    const spawnSpread = CART_BASE_SPAWN_MS - CART_MIN_SPAWN_MS;
    s.spawnCooldownMs = CART_BASE_SPAWN_MS - spawnSpread * difficulty + crypto.randomInt(-90, 140);
    if (s.spawnCooldownMs < CART_MIN_SPAWN_MS) s.spawnCooldownMs = CART_MIN_SPAWN_MS;
  }

  s.score = Math.floor((Number(s.distance) || 0) / 10) + (Number(s.btcCount) || 0) * CART_COIN_POINTS;

  socket.emit("game:cart_update", {
    lane: s.lane,
    score: s.score,
    health: s.health,
    distance: s.distance,
    btcCount: Number(s.btcCount) || 0,
    events: s.events,
    hit,
    targetScore: CART_TARGET_SCORE,
    roadSpeed: s.roadSpeed,
    difficulty
  });

  if (s.score >= CART_TARGET_SCORE) {
    finishGame(socket, s, true, engine);
  } else if (s.health <= 0) {
    finishGame(socket, s, false, engine, "cart_crashed");
  }
}

// ─── Block Stack: server-authoritative drop handler ──────────────────────────
//
// Anti-cheat rationale: client cannot lie about *when* a block landed because
// the server recorded `blockStartedAt` and knows `travelMs` + `playWidth`.
// We recompute the block's logical left position from elapsed time and clamp
// the overlap against the previous tower base. If the overlap is too narrow
// (or absent), the run ends. Drops faster than STACK_DROP_MIN_INTERVAL_MS are
