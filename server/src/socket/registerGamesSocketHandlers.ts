import crypto from 'node:crypto';
import type { Socket } from "socket.io";
import prisma from '../db/prisma.js';
import loggerLib from '../../utils/logger.js';
import { syncUserBaseHashRate } from '../../models/minerProfileModel.js';
import { verifyAccessToken } from '../../utils/authTokens.js';
import { getTokenFromRequest } from '../../utils/token.js';
import { getBrazilDateKeyAliases } from '../../utils/checkinDate.js';
import { notifyMiniPassGamePlayed } from '../../services/miniPass/miniPassMissionHookService.js';
import { notifyDailyTaskGamePlayed } from '../../services/dailyTasks/dailyTaskHookService.js';
import { getMemoryMismatchRevealMs } from '../../utils/memoryGameConstants.js';
import { createAuditLogBestEffort } from '../../models/auditLogModel.js';
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
  'crypto-memory': 'Memory Sync',
  'crypto-match-3': 'Power Match',
  'cart-rush': 'Cart Rush',
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

const SYMBOLS = ['bitcoin', 'ethereum', 'solana', 'binance-coin', 'cardano', 'polkadot', 'dogecoin', 'polygon'];
const MATCH3_SYMBOLS = ['bitcoin', 'ethereum', 'solana', 'binance-coin', 'cardano'];
const CART_LANES = 3;
const CART_TICK_MS = 200;
const CART_TARGET_SCORE = 750;
const CART_TIME_LIMIT_SECONDS = 120;
const CART_MAX_HEALTH = 3;
const CART_COLLISION_PROGRESS = 0.9;
const CART_DESPAWN_PROGRESS = 1.18;
const CART_DIFFICULTY_RAMP_MS = 90000;
const CART_BASE_SPEED = 0.48;
const CART_MAX_SPEED = 0.9;
const CART_BASE_SPAWN_MS = 900;
const CART_MIN_SPAWN_MS = 360;
const CART_DISTANCE_PER_TICK = 10;
const CART_COIN_POINTS = 50;
const GAME_SLUG_MAX_LEN = 64;

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
  const x = Number(/** @type {{ x?: unknown }} */ (p).x);
  const y = Number(/** @type {{ y?: unknown }} */ (p).y);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 7 || y < 0 || y > 7) return null;
  return { x, y };
}
const CART_ENEMY_VARIANTS = [
  { body: "#f97316", accent: "#fdba74", glow: "rgba(249,115,22,0.45)" },
  { body: "#ef4444", accent: "#fca5a5", glow: "rgba(239,68,68,0.45)" },
  { body: "#fb7185", accent: "#fecdd3", glow: "rgba(251,113,133,0.42)" },
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
          update: {},
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

        if (slug === 'crypto-memory') {
          initialState.board = secureShuffle([...SYMBOLS, ...SYMBOLS]).map((symbol, id) => ({
            id,
            symbol,
            isFlipped: false,
            isMatched: false,
          }));
          initialState.flipped = [];
          socket.emit("game:started", {
            game: slug,
            board: getMemoryBoard(initialState).map((c) => ({ id: c.id, isFlipped: false, isMatched: false })),
            score: 0,
          });
        } 
        else if (slug === 'crypto-match-3') {
          initialState.board = generateStableBoard();
          socket.emit("game:started", { game: slug, board: initialState.board, score: 0 });
        } else if (slug === 'cart-rush') {
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
            timeLimitSeconds: CART_TIME_LIMIT_SECONDS,
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
      }
      else if (state.slug === 'crypto-match-3' && action.type === 'swap') {
        const from = readMatch3GridCoord(action.from);
        const to = readMatch3GridCoord(action.to);
        if (!from || !to) return;
        handleMatch3Swap(socket, state, from, to, engine);
      }
      else if (state.slug === 'cart-rush' && action.type === 'lane') {
        const lane = Number(action.lane);
        if (!Number.isInteger(lane) || lane < 0 || lane >= CART_LANES) return;
        state.lane = lane;
        socket.emit("game:cart_lane", { lane: state.lane });
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
}

function generateStableBoard(): string[][] {
  const board: string[][] = [];
  for (let y = 0; y < 8; y++) {
    board[y] = [];
    for (let x = 0; x < 8; x++) {
      let s: string;
      do { s = randomMatch3Symbol(); }
      while ((x >= 2 && board[y][x-1] === s && board[y][x-2] === s) || (y >= 2 && board[y-1][x] === s && board[y-2][x] === s));
      board[y][x] = s;
    }
  }
  return board;
}

function handleMatch3Swap(socket, state: GameSessionState, from, to, engine) {
  const dx = Math.abs(from.x - to.x), dy = Math.abs(from.y - to.y);
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
      if (board[y][x] && board[y][x] === board[y][x+1] && board[y][x] === board[y][x+2]) {
        matches.add(`${x},${y}`); matches.add(`${x+1},${y}`); matches.add(`${x+2},${y}`);
      }
    }
  }
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 6; y++) {
      if (board[y][x] && board[y][x] === board[y+1][x] && board[y][x] === board[y+2][x]) {
        matches.add(`${x},${y}`); matches.add(`${x},${y+1}`); matches.add(`${x},${y+2}`);
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
  matches.forEach(m => board[m.y][m.x] = null);
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
    variant,
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
      progress: Number(event.progress || 0) + Number(event.speed || s.roadSpeed) * tickSeconds,
    }))
    .filter((event) => Number(event.progress || 0) <= CART_DESPAWN_PROGRESS);

  let hit: CartRushCartEvent | null = null;
  const survivors: CartRushCartEvent[] = [];
  for (const event of s.events) {
    if (Number(event.progress || 0) >= CART_COLLISION_PROGRESS) {
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
    survivors.push(event);
  }
  s.events = survivors;

  s.spawnCooldownMs = Math.max(0, Number(s.spawnCooldownMs || 0) - CART_TICK_MS);
  if (s.spawnCooldownMs <= 0) {
    s.events.push(createCartEvent(s.distance, difficulty));
    const spawnSpread = CART_BASE_SPAWN_MS - CART_MIN_SPAWN_MS;
    s.spawnCooldownMs =
      CART_BASE_SPAWN_MS - spawnSpread * difficulty + crypto.randomInt(-90, 140);
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
    difficulty,
  });

  if (s.score >= CART_TARGET_SCORE) {
    finishGame(socket, s, true, engine);
  } else if (s.health <= 0) {
    finishGame(socket, s, false, engine, "cart_crashed");
  }
}

async function finishGame(socket: Socket, state: GameSessionState, success: boolean, engine: MiningEngine, failureCode = "session_ended") {
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
        cooldownSeconds: Math.ceil(GAME_COOLDOWN_MS / 1000),
      });
    }

    // Verifica se o usuário fez check-in hoje — sem check-in bônus dura só 24h
    const checkinToday = await prisma.dailyCheckin.findFirst({
      where: {
        userId: Number(state.userId),
        status: 'confirmed',
        checkinDate: { in: getBrazilDateKeyAliases() }
      },
      select: { id: true },
      orderBy: [{ confirmedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]
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
          userPowerGameId: powerRow.id,
        },
      }).catch(() => {});
      const total = await syncUserBaseHashRate(state.userId);
      const miner = engine.miners.get(state.userId.toString());
      if (miner) miner.baseHashRate = total;

      socket.emit("game:finished", {
        success: true,
        rewardCode,
        rewardParams,
        cooldownSeconds: Math.ceil(GAME_COOLDOWN_MS / 1000),
      });
      socket.emit("machines:update");
    } catch (e) { 
      socket.emit("game:finished", {
        success: true,
        rewardCode: "persist_ok",
        cooldownSeconds: Math.ceil(GAME_COOLDOWN_MS / 1000),
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
        reason: failureCode,
      },
    }).catch(() => {});
    socket.emit("game:finished", {
      success: false,
      messageCode: failureCode,
      cooldownSeconds: Math.ceil(GAME_COOLDOWN_MS / 1000),
    });
  }
}
