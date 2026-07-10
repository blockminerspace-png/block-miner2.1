import type { Socket } from "socket.io";
import type { MiningEngine } from "../../miningEngine.js";
import type { GameSessionState } from "./games-socket.types.js";
import { randomMatch3Symbol } from "./games-socket.utils.js";
import { finishGame } from "./finish-game.socket.js";

export function generateStableBoard(): string[][] {
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

export function handleMatch3Swap(socket, state: GameSessionState, from, to, engine) {
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

export function findMatches(board: string[][]) {
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

export function processCascades(board, matches) {
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
