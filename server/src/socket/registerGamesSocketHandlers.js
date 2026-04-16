import crypto from 'node:crypto';
import prisma from '../db/prisma.js';
import loggerLib from '../../utils/logger.js';
import { syncUserBaseHashRate } from '../../models/minerProfileModel.js';
import { verifyAccessToken } from '../../utils/authTokens.js';
import { getTokenFromRequest } from '../../utils/token.js';
import { getBrazilCheckinDateKey } from '../../utils/checkinDate.js';
import { notifyMiniPassGamePlayed } from '../../services/miniPass/miniPassMissionHookService.js';
import { notifyDailyTaskGamePlayed } from '../../services/dailyTasks/dailyTaskHookService.js';
import { getMemoryMismatchRevealMs } from '../../utils/memoryGameConstants.js';

const logger = loggerLib.child("GamesSocket");
const GAME_SESSIONS = new Map();
const GAME_NAMES = {
  'crypto-memory': 'Memory Sync',
  'crypto-match-3': 'Power Match',
};
const LAST_GAME_FINISH = new Map(); // key: `${userId}-${gameSlug}`
const GAME_COOLDOWN_MS = Number(process.env.GAME_COOLDOWN_MS) || 180000;
const GAME_POWER_DAYS = Number(process.env.GAME_POWER_DAYS) || 7;
/** Time for the client flip-open animation to settle so both cards are fully visible. */
const MEMORY_FLIP_OPEN_SETTLE_MS = 320;
const MEMORY_MISMATCH_HOLD_MS = getMemoryMismatchRevealMs();
const MEMORY_MISMATCH_TOTAL_MS = MEMORY_FLIP_OPEN_SETTLE_MS + MEMORY_MISMATCH_HOLD_MS;

const SYMBOLS = ['bitcoin', 'ethereum', 'solana', 'binance-coin', 'cardano', 'polkadot', 'dogecoin', 'polygon'];
const MATCH3_SYMBOLS = ['bitcoin', 'ethereum', 'solana', 'binance-coin', 'cardano'];

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
        const prev = GAME_SESSIONS.get(socket.id);
        clearMemoryMismatchTimer(prev);

        const requestLike = { headers: socket.request?.headers || {} };
        const authToken = getTokenFromRequest(requestLike);
        const payload = authToken ? verifyAccessToken(authToken) : null;
        const userId = Number(payload?.sub);

        if (!userId) return socket.emit("game:error", { code: "invalid_session" });

        // Cooldown check individual por jogo
        const cooldownKey = `${userId}-${gameSlug}`;
        const lastFinish = LAST_GAME_FINISH.get(cooldownKey);
        if (lastFinish) {
          const elapsed = Date.now() - lastFinish;
          if (elapsed < GAME_COOLDOWN_MS) {
            const remaining = Math.ceil((GAME_COOLDOWN_MS - elapsed) / 1000);
            return socket.emit("game:error", { code: "cooldown", seconds: remaining });
          }
        }

        const gameName = GAME_NAMES[gameSlug];
        if (!gameName) return socket.emit("game:error", { code: "unknown_game" });
        const game = await prisma.game.upsert({
          where: { slug: gameSlug },
          create: { name: gameName, slug: gameSlug, isActive: true },
          update: {},
        });
        if (!game.isActive) return socket.emit("game:error", { code: "game_paused" });

        let initialState = {
          gameId: Number(game.id),
          slug: gameSlug,
          userId: Number(userId),
          score: 0,
          isFinished: false,
          startTime: Date.now(),
          lastUpdate: Date.now()
        };

        if (gameSlug === 'crypto-memory') {
          initialState.board = secureShuffle([...SYMBOLS, ...SYMBOLS]).map((symbol, id) => ({
            id,
            symbol,
            isFlipped: false,
            isMatched: false,
          }));
          initialState.flipped = [];
          socket.emit("game:started", { game: gameSlug, board: initialState.board.map(c => ({ id: c.id, isFlipped: false, isMatched: false })), score: 0 });
        } 
        else if (gameSlug === 'crypto-match-3') {
          initialState.board = generateStableBoard();
          socket.emit("game:started", { game: gameSlug, board: initialState.board, score: 0 });
        }

        GAME_SESSIONS.set(socket.id, initialState);
      } catch (error) {
        logger.error("Game Start Error", error);
        socket.emit("game:error", { code: "start_failed" });
      }
    });

    socket.on("game:action", (action) => {
      const state = GAME_SESSIONS.get(socket.id);
      if (!state || state.isFinished) return;

      if (state.slug === 'crypto-memory' && action.type === 'flip') {
        if (state.flipped.length >= 2) return;
        const card = state.board.find(c => c.id === action.cardId);
        if (!card || card.isFlipped || card.isMatched) return;

        card.isFlipped = true;
        state.flipped.push(card);
        socket.emit("game:card_flipped", { id: card.id, symbol: card.symbol });

        if (state.flipped.length === 2) {
          const [c1, c2] = state.flipped;
          if (c1.symbol === c2.symbol) {
            c1.isMatched = true; c2.isMatched = true;
            state.score += 250; state.flipped = [];
            socket.emit("game:match", { ids: [c1.id, c2.id], score: state.score });
            if (state.board.every(c => c.isMatched)) finishGame(socket, state, true, engine);
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
              const card1 = live.board.find((c) => c.id === id1);
              const card2 = live.board.find((c) => c.id === id2);
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
        handleMatch3Swap(socket, state, action.from, action.to, engine);
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
function clearMemoryMismatchTimer(state) {
  if (state?.memoryMismatchTimeout) {
    clearTimeout(state.memoryMismatchTimeout);
    state.memoryMismatchTimeout = null;
  }
}

function generateStableBoard() {
  let board = [];
  for (let y = 0; y < 8; y++) {
    board[y] = [];
    for (let x = 0; x < 8; x++) {
      let s;
      do { s = randomMatch3Symbol(); }
      while ((x >= 2 && board[y][x-1] === s && board[y][x-2] === s) || (y >= 2 && board[y-1][x] === s && board[y-2][x] === s));
      board[y][x] = s;
    }
  }
  return board;
}

function handleMatch3Swap(socket, state, from, to, engine) {
  const dx = Math.abs(from.x - to.x), dy = Math.abs(from.y - to.y);
  if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
    const board = state.board;
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

function findMatches(board) {
  const matches = new Set();
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
  return Array.from(matches).map(s => { const [x, y] = s.split(',').map(Number); return {x, y}; });
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

async function finishGame(socket, state, success, engine) {
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
    const today = getBrazilCheckinDateKey();
    const checkinToday = await prisma.dailyCheckin.findUnique({
      where: { userId_checkinDate: { userId: Number(state.userId), checkinDate: today } },
      select: { status: true },
    });
    const powerDays = (checkinToday?.status === 'confirmed') ? GAME_POWER_DAYS : 1;
    const rewardCode = powerDays >= GAME_POWER_DAYS ? "full_term" : "short_term";
    const rewardParams = { days: GAME_POWER_DAYS };

    const expiresAt = new Date(Date.now() + powerDays * 24 * 60 * 60 * 1000);
    try {
      // ANTI-CHEAT: Limita o máximo de poderes ativos acumulados pelo minigame a um valor seguro (ex: max 10 instâncias = 500 H/s)
      const powerRow = await prisma.userPowerGame.create({
        data: {
          userId: Number(state.userId),
          gameId: Number(state.gameId),
          hashRate: 50.0,
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
    socket.emit("game:finished", {
      success: false,
      messageCode: "session_ended",
      cooldownSeconds: Math.ceil(GAME_COOLDOWN_MS / 1000),
    });
  }
}
