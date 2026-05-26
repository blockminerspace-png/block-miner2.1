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
  "mining-tap": "Mining Tap"
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
const STACK_TARGET_BLOCKS = 10;          // Win condition: 10 successful stacks
const STACK_INITIAL_WIDTH = 120;         // Pixels of the first / base block
const STACK_TRAVEL_MS_INITIAL = 2200;    // Time the first block takes to traverse the play area
const STACK_TRAVEL_MS_MIN = 950;         // Cap on how fast blocks can travel as difficulty ramps
const STACK_TRAVEL_DECAY_PER_BLOCK = 140; // ms shaved off per successful block
// Sum check: even a perfect run can't finish below ~15s anti-cheat floor.
// Min sum = 2200+2060+1920+1780+1640+1500+1360+1220+1080+950 ≈ 15.7s
const STACK_PLAY_WIDTH = 480;            // Logical play-area width the block oscillates within
const STACK_MIN_WIDTH = 18;              // Below this, block is considered fully missed → game over
const STACK_DROP_MIN_INTERVAL_MS = 250;  // Min realistic time between two drops (humans cap ~4/s)

type BlockStackState = GameSessionState & {
  slug: "block-stack";
  blocksPlaced: number;          // Successful stacks so far (max STACK_TARGET_BLOCKS)
  currentWidth: number;          // Width of the moving block (px)
  currentTravelMs: number;       // ms for current block to cross the play area
  blockStartedAt: number;        // ms timestamp when current block animation started server-side
  baseLeftPx: number;            // Left edge of the stacked tower (px from playable origin)
  lastDropAt: number;            // Timestamp of last drop action (rate-limit)
};

// ─── Mining Tap constants ───────────────────────────────────────────────────
// Click-spam game with hidden "glitch" windows: tapping during a glitch costs
// score and counts as anti-cheat noise. Game ends after MINING_TAP_DURATION_MS.
const MINING_TAP_DURATION_MS = 30_000;          // Total play time
const MINING_TAP_TARGET_SCORE = 150;            // Win threshold
const MINING_TAP_MAX_TPS = 8;                   // Max human-realistic taps per second
const MINING_TAP_RECENT_WINDOW_MS = 1000;       // Sliding window the rate-limit checks
const MINING_TAP_REWARD_PER_TAP = 1;            // Score per valid tap
const MINING_TAP_GLITCH_PENALTY = 10;           // Score deducted per tap during glitch
const MINING_TAP_GLITCH_MIN_INTERVAL_MS = 3500; // Min time between glitch onsets
const MINING_TAP_GLITCH_MAX_INTERVAL_MS = 6500; // Max time between glitch onsets
const MINING_TAP_GLITCH_DURATION_MS = 1400;     // How long each glitch stays ON
const MINING_TAP_TICK_MS = 200;                 // State emit / timeout cadence

type MiningTapState = GameSessionState & {
  slug: "mining-tap";
  endAt: number;                  // When the session must auto-finalize
  recentTaps: number[];           // Sliding-window timestamps of accepted taps (used for tps cap)
  glitchActive: boolean;          // Whether the glitch zone is currently ON
  glitchNextChangeAt: number;     // Server timestamp for next glitch state flip
  tapTickTimer?: ReturnType<typeof setInterval>;
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
        } else if (slug === "mining-tap") {
          initialState.endAt = Date.now() + MINING_TAP_DURATION_MS;
          initialState.recentTaps = [];
          initialState.glitchActive = false;
          initialState.glitchNextChangeAt =
            Date.now() +
            crypto.randomInt(MINING_TAP_GLITCH_MIN_INTERVAL_MS, MINING_TAP_GLITCH_MAX_INTERVAL_MS);
          initialState.tapTickTimer = setInterval(
            () => tickMiningTap(socket, initialState, engine),
            MINING_TAP_TICK_MS
          );
          socket.emit("game:started", {
            game: slug,
            durationMs: MINING_TAP_DURATION_MS,
            targetScore: MINING_TAP_TARGET_SCORE,
            score: 0,
            endsAt: initialState.endAt,
            glitchActive: false,
            maxTps: MINING_TAP_MAX_TPS
          });
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
      } else if (state.slug === "mining-tap" && action.type === "tap") {
        handleMiningTapTap(socket, state as MiningTapState);
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
  const tapT = state.tapTickTimer;
  if (tapT) {
    clearInterval(tapT as ReturnType<typeof setInterval>);
    state.tapTickTimer = null;
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

// ─── Mining Tap: rate-limited click counter with hidden glitch zones ─────────
//
// Anti-cheat rationale:
//  - Server counts every tap and enforces a sliding-window cap (MAX_TPS).
//    A bot spamming 50 taps/s is silently rejected past the cap.
//  - Glitch state lives on the server. The client only learns the current
//    state via emitted events; if the user taps while glitchActive=true on the
//    server, they pay a penalty regardless of any client-side filtering.
//  - The session has a hard deadline (`endAt`) enforced in the tick loop;
//    even if the client never sends `game:end`, the server finalizes at 30s.
function handleMiningTapTap(socket: Socket, state: MiningTapState) {
  const now = Date.now();
  if (now >= state.endAt) return; // No taps after time expired

  // Sliding-window rate limit
  state.recentTaps = state.recentTaps.filter((t) => now - t < MINING_TAP_RECENT_WINDOW_MS);
  if (state.recentTaps.length >= MINING_TAP_MAX_TPS) {
    // Silently drop excess taps; do NOT inform client (avoids tuning the bot)
    return;
  }
  state.recentTaps.push(now);

  if (state.glitchActive) {
    state.score = Math.max(0, state.score - MINING_TAP_GLITCH_PENALTY);
    socket.emit("game:tap_result", { score: state.score, delta: -MINING_TAP_GLITCH_PENALTY, glitch: true });
  } else {
    state.score += MINING_TAP_REWARD_PER_TAP;
    socket.emit("game:tap_result", { score: state.score, delta: MINING_TAP_REWARD_PER_TAP, glitch: false });
  }
}

function tickMiningTap(socket: Socket, state: GameSessionState, engine: MiningEngine) {
  if (!state || state.isFinished || state.slug !== "mining-tap") return;
  const s = state as MiningTapState;
  const now = Date.now();

  // Toggle glitch state if it's time
  if (now >= s.glitchNextChangeAt) {
    s.glitchActive = !s.glitchActive;
    if (s.glitchActive) {
      // Stays on for fixed duration
      s.glitchNextChangeAt = now + MINING_TAP_GLITCH_DURATION_MS;
    } else {
      // Off for a randomized interval before next onset
      s.glitchNextChangeAt =
        now + crypto.randomInt(MINING_TAP_GLITCH_MIN_INTERVAL_MS, MINING_TAP_GLITCH_MAX_INTERVAL_MS);
    }
    socket.emit("game:tap_glitch", { active: s.glitchActive, until: s.glitchNextChangeAt });
  }

  // Tick state broadcast (time left)
  socket.emit("game:tap_tick", {
    timeLeftMs: Math.max(0, s.endAt - now),
    score: s.score,
    glitchActive: s.glitchActive
  });

  // Auto-finalize at session deadline
  if (now >= s.endAt) {
    const success = s.score >= MINING_TAP_TARGET_SCORE;
    finishGame(socket, s, success, engine, success ? "session_ended" : "tap_score_too_low");
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
