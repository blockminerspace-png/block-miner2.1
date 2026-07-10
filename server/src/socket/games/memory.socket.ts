import type { Socket } from "socket.io";
import type { MiningEngine } from "../../miningEngine.js";
import type { GameSessionState } from "./games-socket.types.js";
import { GAME_SESSIONS, MEMORY_MISMATCH_TOTAL_MS, SYMBOLS } from "./games-socket.constants.js";
import { getMemoryBoard, getMemoryFlipped, secureShuffle } from "./games-socket.utils.js";
import { clearMemoryMismatchTimer } from "./shared.socket.js";
import { finishGame } from "./finish-game.socket.js";

export function setupMemoryGame(socket: Socket, initialState: GameSessionState) {
  initialState.board = secureShuffle([...SYMBOLS, ...SYMBOLS]).map((symbol, id) => ({
    id,
    symbol,
    isFlipped: false,
    isMatched: false,
  }));
  initialState.flipped = [];
  socket.emit("game:started", {
    game: "crypto-memory",
    board: getMemoryBoard(initialState).map((c) => ({ id: c.id, isFlipped: false, isMatched: false })),
    score: 0,
  });
}

export function handleMemoryFlip(socket: Socket, state: GameSessionState, action: { type?: string; cardId?: unknown }, engine: MiningEngine) {
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
        if (!live || live !== state || live.isFinished || live.slug !== "crypto-memory") return;
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
