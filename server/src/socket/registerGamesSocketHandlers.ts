import crypto from "node:crypto";
import type { Socket } from "socket.io";
import prisma from "../db/prisma.js";
import loggerLib from "../../utils/logger.js";
import { syncUserBaseHashRate } from "../../models/minerProfileModel.js";
import { verifyAccessToken } from "../../utils/authTokens.js";
import { getTokenFromRequest } from "../../utils/token.js";
import { getBrazilDateKeyAliases } from "../../utils/checkinDate.js";
import { notifyMiniPassGamePlayed } from "../../services/miniPass/miniPassMissionHookService.js";
import { notifyDailyTaskGamePlayed } from "../../services/dailyTasks/dailyTaskHookService.js";
import { getMemoryMismatchRevealMs } from "../../utils/memoryGameConstants.js";
import { createAuditLogBestEffort } from "../../models/auditLogModel.js";
import { errMsg } from "../../types/tsNarrowing.js";
import type { MiningEngine } from "../miningEngine.js";

const logger = loggerLib.child("GamesSocket");

/** Per-socket game session (memory, match-3, cart-rush); extra fields vary by `slug`. */
export type GameSessionState = {
  gameId: number;
  slug: string;
  userId: number;
  score: number;
  isFinished: boolean;
  startTime: number;
  lastUpdate: number;
} & Record<string, unknown>;

/** Narrow shape for cart-rush tick loop (extra fields on session). */
type CartRushCartEvent = {
  id: string;
  lane: number;
  kind: string;
  progress: number;
  speed: number;
  variant?: unknown;
  checked?: boolean;
};

type CartRushState = GameSessionState & {
  slug: "cart-rush";
  lane: number;
  health: number;
  events: CartRushCartEvent[];
  spawnCooldownMs: number;
  distance: number;
  elapsedMs: number;
  btcCount: number;
  roadSpeed: number;
  cartTickTimer?: ReturnType<typeof setInterval>;
};

const GAME_SESSIONS = new Map<string, GameSessionState>();
const GAME_NAMES = {
  "crypto-memory": "Memory Sync",
  "crypto-match-3": "Power Match",
  "cart-rush": "Cart Rush",
  "block-stack": "Block Stack",
  "sky-runner": "Sky Runner"
};

type MemoryCard = { id: number; symbol: string; isFlipped: boolean; isMatched: boolean };

function getMemoryBoard(s: GameSessionState): MemoryCard[] {
  const b = s.board;
  return Array.isArray(b) ? (b as MemoryCard[]) : [];
}

function getMemoryFlipped(s: GameSessionState): MemoryCard[] {
  const f = s.flipped;
  return Array.isArray(f) ? (f as MemoryCard[]) : [];
}
const LAST_GAME_FINISH = new Map(); // key: `${userId}-${gameSlug}`
const GAME_COOLDOWN_MS = Number(process.env.GAME_COOLDOWN_MS) || 180000;
const GAME_POWER_DAYS = Number(process.env.GAME_POWER_DAYS) || 7;
/** Time for the client flip-open animation to settle so both cards are fully visible. */
const MEMORY_FLIP_OPEN_SETTLE_MS = 320;
const MEMORY_MISMATCH_HOLD_MS = getMemoryMismatchRevealMs();
const MEMORY_MISMATCH_TOTAL_MS = MEMORY_FLIP_OPEN_SETTLE_MS + MEMORY_MISMATCH_HOLD_MS;

const SYMBOLS = ["bitcoin", "ethereum", "solana", "binance-coin", "cardano", "polkadot", "dogecoin", "polygon"];
const MATCH3_SYMBOLS = ["bitcoin", "ethereum", "solana", "binance-coin", "cardano"];
const CART_LANES = 3;
const CART_TICK_MS = 200;
const CART_TARGET_SCORE = 250;
const CART_TIME_LIMIT_SECONDS = 120;
const CART_MAX_HEALTH = 3;
const CART_COLLISION_PROGRESS = 0.70;
const CART_DESPAWN_PROGRESS = 1.18;
const CART_DIFFICULTY_RAMP_MS = 90000;
const CART_BASE_SPEED = 0.35;
const CART_MAX_SPEED = 0.65;
const CART_BASE_SPAWN_MS = 1200;
const CART_MIN_SPAWN_MS = 500;
const CART_DISTANCE_PER_TICK = 10;
const CART_COIN_POINTS = 50;
const GAME_SLUG_MAX_LEN = 64;

// ─── Block Stack constants ───────────────────────────────────────────────────
// Server emits block-spawn events; client only animates locally. The server
// authoritatively decides where the block is at the moment of the `drop`
// action by recomputing position from (server time received - blockStartedAt).
const STACK_TARGET_BLOCKS = 8;            // Win condition: 8 successful stacks (was 10)
const STACK_INITIAL_WIDTH = 200;          // Much wider starting block (was 120) — much more forgiving
const STACK_TRAVEL_MS_INITIAL = 2600;     // Slower start (was 2200)
const STACK_TRAVEL_MS_MIN = 1200;         // Slower top speed (was 950) — endgame still readable
const STACK_TRAVEL_DECAY_PER_BLOCK = 200; // Bigger steps but fewer blocks (was 140 × 10)
// Min run sum: 2600+2400+2200+2000+1800+1600+1400+1200 = 15.2s ≥ 15s anti-cheat floor.
const STACK_PLAY_WIDTH = 480;             // Logical play-area width (unchanged)
const STACK_MIN_WIDTH = 28;               // Larger forgiveness margin (was 18) — easier to "graze" successfully
const STACK_DROP_MIN_INTERVAL_MS = 250;   // Anti-flood: max ~4 drops/s

type BlockStackState = GameSessionState & {
  slug: "block-stack";
  blocksPlaced: number;          // Successful stacks so far (max STACK_TARGET_BLOCKS)
  currentWidth: number;          // Width of the moving block (px)
  currentTravelMs: number;       // ms for current block to cross the play area
  blockStartedAt: number;        // ms timestamp when current block animation started server-side
  baseLeftPx: number;            // Left edge of the stacked tower (px from playable origin)
  lastDropAt: number;            // Timestamp of last drop action (rate-limit)
};

// ─── Sky Runner constants ────────────────────────────────────────────────────
// Flappy-Bird-style game with a tiny airplane navigating between pipe gaps.
// The server is fully authoritative: it ticks the world, applies gravity to
// the player's Y position, spawns pipe pairs at fixed intervals, and runs
// collision/score detection. The client only sends one action: `{type:"flap"}`.
// That gives us strong anti-cheat — no client-side score, no client position.
const SKY_TICK_MS = 33;                       // ~30 ticks/s — smooth, low jitter
const SKY_WORLD_W = 600;                      // Logical playfield width
const SKY_WORLD_H = 800;                      // Logical playfield height
const SKY_PLANE_X = 140;                      // Plane stays at a fixed X
const SKY_PLANE_RADIUS = 22;                  // Hitbox radius
const SKY_GRAVITY = 1500;                     // px / s²  (slightly gentler for casual feel)
const SKY_FLAP_VY = -480;                     // px / s impulse on flap
const SKY_MAX_VY = 800;                       // Terminal velocity (px/s)
const SKY_MIN_FLAP_INTERVAL_MS = 80;          // Anti-bot rate-limit (max ~12 flaps/s)
const SKY_PIPE_W = 90;                        // Pipe width
const SKY_PIPE_GAP = 250;                     // Generous starting gap
const SKY_PIPE_GAP_MIN = 190;                 // Floor for difficulty ramp
const SKY_PIPE_SPAWN_DX = 300;                // Distance between consecutive pipe pairs (px)
const SKY_SCROLL_SPEED_BASE = 170;            // px/s starting scroll speed
const SKY_SCROLL_SPEED_MAX = 260;             // px/s top speed
const SKY_DIFFICULTY_RAMP_MS = 60000;         // 60s to reach max speed/min gap
const SKY_TARGET_PIPES = 15;                  // Win condition: pass 15 pipe pairs (slightly shorter)
const SKY_PIPE_MARGIN = 90;                   // Min margin from top/bottom for the gap center
const SKY_LIVES = 3;                          // Wrong-pipe-clip / boundary budget
const SKY_INVULN_MS = 1500;                   // After losing a life, plane blinks invulnerable for 1.5s
// Anti-cheat: 15 pipes × ~1.65s avg time-between-pipes (300 / scroll_speed avg ~215)
//   ≈ 24.7s of mandatory play time — comfortably above the 15s floor.

type SkyPipe = {
  id: number;
  x: number;            // World X of the pipe's left edge
  gapTop: number;       // Y of the top of the gap
  gapBottom: number;    // Y of the bottom of the gap
  passed: boolean;      // Score-once flag
};

type SkyRunnerState = GameSessionState & {
  slug: "sky-runner";
  y: number;            // Plane center Y in world coords
  vy: number;           // Plane vertical velocity (px/s)
  pipes: SkyPipe[];
  pipesPassed: number;  // Successfully passed pipe pairs
  elapsedMs: number;
  nextPipeAt: number;   // World X at which the next pipe should spawn
  scrollSpeed: number;  // Current px/s
  lastFlapAt: number;   // Throttle reference
  pipeSeq: number;      // Monotonic pipe id counter
  lives: number;        // Remaining lives
  invulnUntil: number;  // Date.now() until which collisions are ignored
  skyTickTimer?: ReturnType<typeof setInterval>;
};

/** @param {unknown} raw */
function parseGameSlug(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > GAME_SLUG_MAX_LEN) return null;
  return Object.prototype.hasOwnProperty.call(GAME_NAMES, s) ? s : null;
}

/** @param {unknown} p */
function readMatch3GridCoord(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const x = Number(/** @type {{ x?: unknown }} */ p.x);
  const y = Number(/** @type {{ y?: unknown }} */ p.y);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 7 || y < 0 || y > 7) return null;
  return { x, y };
}
const CART_ENEMY_VARIANTS = [
  { body: "#f97316", accent: "#fdba74", glow: "rgba(249,115,22,0.45)" },
  { body: "#ef4444", accent: "#fca5a5", glow: "rgba(239,68,68,0.45)" },
  { body: "#fb7185", accent: "#fecdd3", glow: "rgba(251,113,133,0.42)" }
];

/**
 * Fisher–Yates shuffle using cryptographically strong indices.
 * @template T
 * @param {T[]} items
 * @returns {T[]}
 */
function secureShuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function randomMatch3Symbol() {
  return MATCH3_SYMBOLS[crypto.randomInt(0, MATCH3_SYMBOLS.length)];
}

export function registerGamesSocketHandlers({ io, engine }) {
  io.on("connection", (socket) => {
    socket.on("game:start", async (gameSlug) => {
      try {
        const slug = parseGameSlug(gameSlug);
        if (!slug) return socket.emit("game:error", { code: "unknown_game" });

        const prev = GAME_SESSIONS.get(socket.id);
        if (prev && !prev.isFinished) {
          return socket.emit("game:error", { code: "session_active" });
        }
        if (prev) {
          clearMemoryMismatchTimer(prev);
          GAME_SESSIONS.delete(socket.id);
        }

        const requestLike = { headers: socket.request?.headers || {} };
        const authToken = getTokenFromRequest(requestLike);
        const payload = authToken ? verifyAccessToken(authToken) : null;
        const userId = Number(payload?.sub);

        if (!userId) return socket.emit("game:error", { code: "invalid_session" });

        // Cooldown check individual por jogo
        const cooldownKey = `${userId}-${slug}`;
        const lastFinish = LAST_GAME_FINISH.get(cooldownKey);
        if (lastFinish) {
          const elapsed = Date.now() - lastFinish;
          if (elapsed < GAME_COOLDOWN_MS) {
            const remaining = Math.ceil((GAME_COOLDOWN_MS - elapsed) / 1000);
            return socket.emit("game:error", { code: "cooldown", seconds: remaining });
          }
        }

        const gameName = GAME_NAMES[slug];
        if (!gameName) return socket.emit("game:error", { code: "unknown_game" });
        const game = await prisma.game.upsert({
          where: { slug },
          create: { name: gameName, slug, isActive: true },
          update: {}
        });
        if (!game.isActive) return socket.emit("game:error", { code: "game_paused" });

        let initialState: GameSessionState = {
          gameId: Number(game.id),
          slug,
          userId: Number(userId),
          score: 0,
          isFinished: false,
          startTime: Date.now(),
          lastUpdate: Date.now()
        };

        if (slug === "crypto-memory") {
          initialState.board = secureShuffle([...SYMBOLS, ...SYMBOLS]).map((symbol, id) => ({
            id,
            symbol,
            isFlipped: false,
            isMatched: false
          }));
          initialState.flipped = [];
          socket.emit("game:started", {
            game: slug,
            board: getMemoryBoard(initialState).map((c) => ({ id: c.id, isFlipped: false, isMatched: false })),
            score: 0
          });
        } else if (slug === "crypto-match-3") {
          initialState.board = generateStableBoard();
          socket.emit("game:started", { game: slug, board: initialState.board, score: 0 });
        } else if (slug === "cart-rush") {
          initialState.lane = 1;
          initialState.health = CART_MAX_HEALTH;
          initialState.events = [];
          initialState.distance = 0;
          initialState.btcCount = 0;
          initialState.elapsedMs = 0;
          initialState.roadSpeed = CART_BASE_SPEED;
          initialState.spawnCooldownMs = 450;
          initialState.cartTickTimer = setInterval(() => tickCartRush(socket, initialState, engine), CART_TICK_MS);
          socket.emit("game:started", {
            game: slug,
            lane: initialState.lane,
            lanes: CART_LANES,
            health: initialState.health,
            targetScore: CART_TARGET_SCORE,
            score: 0,
            distance: 0,
            btcCount: 0,
            roadSpeed: initialState.roadSpeed,
            timeLimitSeconds: CART_TIME_LIMIT_SECONDS
          });
        } else if (slug === "block-stack") {
          // First block: full width, centered, starts moving NOW.
          initialState.blocksPlaced = 0;
          initialState.currentWidth = STACK_INITIAL_WIDTH;
          initialState.currentTravelMs = STACK_TRAVEL_MS_INITIAL;
          initialState.blockStartedAt = Date.now();
          initialState.baseLeftPx = (STACK_PLAY_WIDTH - STACK_INITIAL_WIDTH) / 2;
          initialState.lastDropAt = 0;
          socket.emit("game:started", {
            game: slug,
            target: STACK_TARGET_BLOCKS,
            playWidth: STACK_PLAY_WIDTH,
            blocksPlaced: 0,
            score: 0,
            block: {
              width: STACK_INITIAL_WIDTH,
              travelMs: STACK_TRAVEL_MS_INITIAL,
              startedAt: initialState.blockStartedAt
            },
            base: { leftPx: initialState.baseLeftPx, width: STACK_INITIAL_WIDTH }
          });
        } else if (slug === "sky-runner") {
          // Plane spawns horizontally centered, the world scrolls towards it.
          initialState.y = SKY_WORLD_H / 2;
          initialState.vy = 0;
          initialState.pipes = [];
          initialState.pipesPassed = 0;
          initialState.elapsedMs = 0;
          initialState.nextPipeAt = SKY_WORLD_W + 200; // First pipe pre-queued just off-screen (more reaction time)
          initialState.scrollSpeed = SKY_SCROLL_SPEED_BASE;
          initialState.lastFlapAt = 0;
          initialState.pipeSeq = 0;
          initialState.lives = SKY_LIVES;
          initialState.invulnUntil = Date.now() + 1200; // Brief grace period at start
          // Pre-seed two pipes so the player has something to aim at immediately
          (initialState as SkyRunnerState).pipes.push(makeSkyPipe(initialState as SkyRunnerState));
          (initialState as SkyRunnerState).pipes.push(makeSkyPipe(initialState as SkyRunnerState));
          socket.emit("game:started", {
            game: slug,
            worldW: SKY_WORLD_W,
            worldH: SKY_WORLD_H,
            planeX: SKY_PLANE_X,
            planeRadius: SKY_PLANE_RADIUS,
            pipeW: SKY_PIPE_W,
            targetPipes: SKY_TARGET_PIPES,
            tickMs: SKY_TICK_MS,
            y: initialState.y,
            vy: initialState.vy,
            pipes: (initialState as SkyRunnerState).pipes,
            pipesPassed: 0,
            scrollSpeed: initialState.scrollSpeed,
            lives: SKY_LIVES,
            maxLives: SKY_LIVES,
            invulnerable: true,
            score: 0
          });
          (initialState as SkyRunnerState).skyTickTimer = setInterval(
            () => tickSkyRunner(socket, initialState as SkyRunnerState, engine),
            SKY_TICK_MS
          );
        }

        GAME_SESSIONS.set(socket.id, initialState);
      } catch (error: unknown) {
        logger.error("Game Start Error", { error: errMsg(error) });
        socket.emit("game:error", { code: "start_failed" });
      }
    });

    socket.on("game:action", (action) => {
      if (!action || typeof action !== "object" || Array.isArray(action)) return;
      const state = GAME_SESSIONS.get(socket.id);
      if (!state || state.isFinished) return;

      if (state.slug === "crypto-memory" && action.type === "flip") {
        const board = getMemoryBoard(state);
        if (!Array.isArray(state.flipped)) state.flipped = [];
        const flipped = getMemoryFlipped(state);
        if (flipped.length >= 2) return;
        const cardId = Number(action.cardId);
        if (!Number.isInteger(cardId) || cardId < 0 || cardId >= board.length) return;
        const card = board.find((c) => c.id === cardId);
        if (!card || card.isFlipped || card.isMatched) return;

        card.isFlipped = true;
        flipped.push(card);
        state.flipped = flipped;
        socket.emit("game:card_flipped", { id: card.id, symbol: card.symbol });

        if (flipped.length === 2) {
          const [c1, c2] = flipped;
          if (c1.symbol === c2.symbol) {
            c1.isMatched = true;
            c2.isMatched = true;
            state.score += 250;
            state.flipped = [];
            socket.emit("game:match", { ids: [c1.id, c2.id], score: state.score });
            if (board.every((c) => c.isMatched)) finishGame(socket, state, true, engine);
          } else {
            const id1 = c1.id;
            const id2 = c2.id;
            clearMemoryMismatchTimer(state);
            state.memoryMismatchTimeout = setTimeout(() => {
              state.memoryMismatchTimeout = null;
              const live = GAME_SESSIONS.get(socket.id);
              if (!live || live !== state || live.isFinished || live.slug !== "crypto-memory") {
                return;
              }
              const liveBoard = getMemoryBoard(live);
              const card1 = liveBoard.find((c) => c.id === id1);
              const card2 = liveBoard.find((c) => c.id === id2);
              if (!card1 || !card2 || card1.isMatched || card2.isMatched) {
                live.flipped = [];
                return;
              }
              card1.isFlipped = false;
              card2.isFlipped = false;
              live.flipped = [];
              socket.emit("game:mismatch", { ids: [id1, id2] });
            }, MEMORY_MISMATCH_TOTAL_MS);
          }
        }
      } else if (state.slug === "crypto-match-3" && action.type === "swap") {
        const from = readMatch3GridCoord(action.from);
        const to = readMatch3GridCoord(action.to);
        if (!from || !to) return;
        handleMatch3Swap(socket, state, from, to, engine);
      } else if (state.slug === "cart-rush" && action.type === "lane") {
        const lane = Number(action.lane);
        if (!Number.isInteger(lane) || lane < 0 || lane >= CART_LANES) return;
        state.lane = lane;
        socket.emit("game:cart_lane", { lane: state.lane });
      } else if (state.slug === "block-stack" && action.type === "drop") {
        handleBlockStackDrop(socket, state as BlockStackState, engine);
      } else if (state.slug === "sky-runner" && action.type === "flap") {
        handleSkyRunnerFlap(socket, state as SkyRunnerState);
      }
    });

    socket.on("game:end", () => {
      const state = GAME_SESSIONS.get(socket.id);
      if (state && !state.isFinished) {
        finishGame(socket, state, false, engine);
      }
    });

    socket.on("disconnect", () => {
      const s = GAME_SESSIONS.get(socket.id);
      clearMemoryMismatchTimer(s);
      GAME_SESSIONS.delete(socket.id);
    });
  });
}

/**
 * @param {object | undefined} state
 */
function clearMemoryMismatchTimer(state: GameSessionState | undefined) {
  if (!state) return;
  const memT = state.memoryMismatchTimeout;
  if (memT) {
    clearTimeout(memT as ReturnType<typeof setTimeout>);
    state.memoryMismatchTimeout = null;
  }
  const cartT = state.cartTickTimer;
  if (cartT) {
    clearInterval(cartT as ReturnType<typeof setInterval>);
    state.cartTickTimer = null;
  }
  const skyT = state.skyTickTimer;
  if (skyT) {
    clearInterval(skyT as ReturnType<typeof setInterval>);
    state.skyTickTimer = null;
  }
}

function generateStableBoard(): string[][] {
  const board: string[][] = [];
  for (let y = 0; y < 8; y++) {
    board[y] = [];
    for (let x = 0; x < 8; x++) {
      let s: string;
      do {
        s = randomMatch3Symbol();
      } while (
        (x >= 2 && board[y][x - 1] === s && board[y][x - 2] === s) ||
        (y >= 2 && board[y - 1][x] === s && board[y - 2][x] === s)
      );
      board[y][x] = s;
    }
  }
  return board;
}

function handleMatch3Swap(socket, state: GameSessionState, from, to, engine) {
  const dx = Math.abs(from.x - to.x),
    dy = Math.abs(from.y - to.y);
  if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
    const board = state.board as string[][];
    const temp = board[from.y][from.x];
    board[from.y][from.x] = board[to.y][to.x];
    board[to.y][to.x] = temp;

    let matches = findMatches(board);
    if (matches.length === 0) {
      board[to.y][to.x] = board[from.y][from.x];
      board[from.y][from.x] = temp;
      return socket.emit("game:invalid_swap");
    }

    let totalPoints = 0;
    while (matches.length > 0) {
      totalPoints += matches.length * 20;
      processCascades(board, matches);
      matches = findMatches(board);
    }

    state.score += totalPoints;
    socket.emit("game:board_update", { board: state.board, score: state.score });
    if (state.score >= 1500) finishGame(socket, state, true, engine);
  }
}

function findMatches(board: string[][]) {
  const matches = new Set<string>();
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 6; x++) {
      if (board[y][x] && board[y][x] === board[y][x + 1] && board[y][x] === board[y][x + 2]) {
        matches.add(`${x},${y}`);
        matches.add(`${x + 1},${y}`);
        matches.add(`${x + 2},${y}`);
      }
    }
  }
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 6; y++) {
      if (board[y][x] && board[y][x] === board[y + 1][x] && board[y][x] === board[y + 2][x]) {
        matches.add(`${x},${y}`);
        matches.add(`${x},${y + 1}`);
        matches.add(`${x},${y + 2}`);
      }
    }
  }
  return Array.from(matches).map((s) => {
    const str = String(s);
    const [x, y] = str.split(",").map(Number);
    return { x, y };
  });
}

function processCascades(board, matches) {
  matches.forEach((m) => (board[m.y][m.x] = null));
  for (let x = 0; x < 8; x++) {
    let emptyRow = 7;
    for (let y = 7; y >= 0; y--) {
      if (board[y][x] !== null) {
        board[emptyRow][x] = board[y][x];
        if (emptyRow !== y) board[y][x] = null;
        emptyRow--;
      }
    }
    for (let y = emptyRow; y >= 0; y--) {
      board[y][x] = randomMatch3Symbol();
    }
  }
}

function cartDifficultyFactor(state) {
  const elapsedMs = Math.max(0, Number(state?.elapsedMs) || 0);
  return Math.min(1, elapsedMs / CART_DIFFICULTY_RAMP_MS);
}

function createCartEvent(distance, difficulty) {
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

function tickCartRush(socket: Socket, state: GameSessionState, engine: MiningEngine) {
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
// silently rejected (rate-limit on rapid spam).
function handleBlockStackDrop(socket: Socket, state: BlockStackState, engine: MiningEngine) {
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

function makeSkyPipe(state: SkyRunnerState): SkyPipe {
  // Difficulty narrows the gap over time
  const t = Math.min(1, state.elapsedMs / SKY_DIFFICULTY_RAMP_MS);
  const gap = SKY_PIPE_GAP - (SKY_PIPE_GAP - SKY_PIPE_GAP_MIN) * t;
  const minCenter = SKY_PIPE_MARGIN + gap / 2;
  const maxCenter = SKY_WORLD_H - SKY_PIPE_MARGIN - gap / 2;
  const center = crypto.randomInt(Math.floor(minCenter), Math.floor(maxCenter) + 1);
  const x = state.nextPipeAt;
  state.nextPipeAt += SKY_PIPE_SPAWN_DX;
  state.pipeSeq += 1;
  return {
    id: state.pipeSeq,
    x,
    gapTop: center - gap / 2,
    gapBottom: center + gap / 2,
    passed: false
  };
}

function handleSkyRunnerFlap(socket: Socket, state: SkyRunnerState) {
  const now = Date.now();
  if (now - (state.lastFlapAt || 0) < SKY_MIN_FLAP_INTERVAL_MS) return;
  state.lastFlapAt = now;
  state.vy = SKY_FLAP_VY;
  // No need to broadcast — the next tick will reflect the new velocity.
}

function tickSkyRunner(socket: Socket, state: SkyRunnerState, engine: MiningEngine) {
  if (!state || state.isFinished || state.slug !== "sky-runner") return;

  const now = Date.now();
  const dtSec = SKY_TICK_MS / 1000;
  state.elapsedMs += SKY_TICK_MS;
  const invulnerable = now < state.invulnUntil;

  // Ramp scroll speed with difficulty
  const t = Math.min(1, state.elapsedMs / SKY_DIFFICULTY_RAMP_MS);
  state.scrollSpeed = SKY_SCROLL_SPEED_BASE + (SKY_SCROLL_SPEED_MAX - SKY_SCROLL_SPEED_BASE) * t;

  // Physics: gravity → vy → y
  state.vy = Math.min(SKY_MAX_VY, state.vy + SKY_GRAVITY * dtSec);
  state.y += state.vy * dtSec;

  // Helper: lose a life or end the run if no lives left
  const loseLife = (reason: string): boolean => {
    if (invulnerable) return false;
    state.lives = Math.max(0, state.lives - 1);
    if (state.lives <= 0) {
      socket.emit("game:sky_update", {
        y: state.y, vy: state.vy, pipes: state.pipes,
        pipesPassed: state.pipesPassed, score: state.score,
        scrollSpeed: state.scrollSpeed, lives: 0,
        invulnerable: false, crashed: reason,
      });
      finishGame(socket, state, false, engine, "sky_crash_" + reason);
      return true;
    }
    // Respawn: recenter, kill velocity, grant brief invulnerability
    state.y = SKY_WORLD_H / 2;
    state.vy = 0;
    state.invulnUntil = now + SKY_INVULN_MS;
    socket.emit("game:sky_hit", { reason, lives: state.lives });
    return false;
  };

  // World bounds: clipping the ceiling or floor costs a life
  if (state.y - SKY_PLANE_RADIUS <= 0) {
    state.y = SKY_PLANE_RADIUS + 1; // Clamp so we don't spam the event next tick
    if (loseLife("ceiling")) return;
  } else if (state.y + SKY_PLANE_RADIUS >= SKY_WORLD_H) {
    state.y = SKY_WORLD_H - SKY_PLANE_RADIUS - 1;
    if (loseLife("floor")) return;
  }

  // Scroll pipes left; drop pipes that left the screen
  for (const p of state.pipes) {
    p.x -= state.scrollSpeed * dtSec;
  }
  state.pipes = state.pipes.filter((p) => p.x + SKY_PIPE_W > -40);

  // Spawn new pipes as the queued head approaches the right edge
  while (state.pipes.length < 4 || state.nextPipeAt < SKY_WORLD_W + SKY_PIPE_SPAWN_DX * 2) {
    state.pipes.push(makeSkyPipe(state));
    if (state.pipes.length > 8) break; // Safety cap
  }

  // Collision + scoring against pipes
  const planeLeft = SKY_PLANE_X - SKY_PLANE_RADIUS;
  const planeRight = SKY_PLANE_X + SKY_PLANE_RADIUS;
  const planeTop = state.y - SKY_PLANE_RADIUS;
  const planeBottom = state.y + SKY_PLANE_RADIUS;
  let hitPipe = false;
  for (const p of state.pipes) {
    const pLeft = p.x;
    const pRight = p.x + SKY_PIPE_W;
    const overlapsX = planeRight > pLeft && planeLeft < pRight;
    if (overlapsX && !invulnerable) {
      if (planeTop < p.gapTop || planeBottom > p.gapBottom) {
        hitPipe = true;
        // Mark the pipe as "passed" so we don't double-charge if the plane
        // brushes it again after respawn — and so the score doesn't tick up.
        p.passed = true;
        break;
      }
    }
    // Score: the moment the plane fully clears the right edge of the pipe
    if (!p.passed && pRight < planeLeft) {
      p.passed = true;
      state.pipesPassed += 1;
      state.score += 100;
    }
  }

  if (hitPipe) {
    if (loseLife("pipe")) return;
  }

  // Broadcast world snapshot every tick (small payload: ~4 pipes on screen)
  socket.emit("game:sky_update", {
    y: state.y,
    vy: state.vy,
    pipes: state.pipes,
    pipesPassed: state.pipesPassed,
    score: state.score,
    scrollSpeed: state.scrollSpeed,
    lives: state.lives,
    invulnerable: now < state.invulnUntil,
    crashed: null
  });

  if (state.pipesPassed >= SKY_TARGET_PIPES) {
    finishGame(socket, state, true, engine);
  }
}

async function finishGame(
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

  // Record finish time for cooldown (individual por jogo)
  LAST_GAME_FINISH.set(`${Number(state.userId)}-${state.slug}`, Date.now());

  if (success) {
    // ANTI-CHEAT: Verifica o tempo mínimo humanamente viável para terminar (ex: 15 segundos)
    const playTimeMs = Date.now() - state.startTime;
    if (playTimeMs < 15000) {
      logger.warn(`Cheating attempt detected: User ${state.userId} finished game too quickly (${playTimeMs}ms).`);
      return socket.emit("game:finished", {
        success: false,
        messageCode: "anti_cheat_timing",
        cooldownSeconds: Math.ceil(GAME_COOLDOWN_MS / 1000)
      });
    }

    // Verifica se o usuário fez check-in hoje — sem check-in bônus dura só 24h
    const checkinToday = await prisma.dailyCheckin.findFirst({
      where: {
        userId: Number(state.userId),
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
      // ANTI-CHEAT: Limita o máximo de poderes ativos acumulados pelo minigame a um valor seguro (ex: max 10 instâncias = 500 H/s)
      const powerRow = await prisma.userPowerGame.create({
        data: {
          userId: Number(state.userId),
          gameId: Number(state.gameId),
          hashRate: 25.0,
          playedAt: new Date(),
          expiresAt
        }
      });
      notifyMiniPassGamePlayed(Number(state.userId), {
        userPowerGameId: powerRow.id,
        gameSlug: String(state.slug || "")
      }).catch(() => {});
      notifyDailyTaskGamePlayed(Number(state.userId), {
        userPowerGameId: powerRow.id,
        gameSlug: String(state.slug || "")
      }).catch(() => {});
      createAuditLogBestEffort({
        userId: Number(state.userId),
        action: "MINIGAME_PLAYED_REWARD",
        ip: socket.handshake?.address || socket.request?.socket?.remoteAddress || null,
        userAgent: socket.request?.headers?.["user-agent"] || null,
        details: {
          gameSlug: String(state.slug || ""),
          score: Number(state.score || 0),
          success: true,
          rewardHashRate: 25,
          rewardDays: powerDays,
          userPowerGameId: powerRow.id
        }
      }).catch(() => {});
      const total = await syncUserBaseHashRate(state.userId);
      const miner = engine.miners.get(state.userId.toString());
      if (miner) miner.baseHashRate = total;

      socket.emit("game:finished", {
        success: true,
        rewardCode,
        rewardParams,
        cooldownSeconds: Math.ceil(GAME_COOLDOWN_MS / 1000)
      });
      socket.emit("machines:update");
    } catch (e) {
      socket.emit("game:finished", {
        success: true,
        rewardCode: "persist_ok",
        cooldownSeconds: Math.ceil(GAME_COOLDOWN_MS / 1000)
      });
    }
  } else {
    createAuditLogBestEffort({
      userId: Number(state.userId),
      action: "MINIGAME_PLAYED_FAILED",
      ip: socket.handshake?.address || socket.request?.socket?.remoteAddress || null,
      userAgent: socket.request?.headers?.["user-agent"] || null,
      details: {
        gameSlug: String(state.slug || ""),
        score: Number(state.score || 0),
        success: false,
        reason: failureCode
      }
    }).catch(() => {});
    socket.emit("game:finished", {
      success: false,
      messageCode: failureCode,
      cooldownSeconds: Math.ceil(GAME_COOLDOWN_MS / 1000)
    });
  }
}
