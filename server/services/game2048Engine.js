/** @typedef {"up"|"down"|"left"|"right"} Game2048Direction */

/** Board edge length — classic 2048 uses 4 (matches arena merge-game layout). */
export const BOARD_SIZE = 4;

/**
 * @returns {number[][]}
 */
export function emptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
}

/**
 * @param {number[][]} board
 * @returns {number}
 */
export function maxTile(board) {
  let m = 0;
  for (let i = 0; i < BOARD_SIZE; i++) {
    for (let j = 0; j < BOARD_SIZE; j++) {
      const v = board[i][j];
      if (v > m) m = v;
    }
  }
  return m;
}

/**
 * @param {number[]} line
 * @returns {{ row: number[]; scoreAdd: number }}
 */
export function mergeLineTowardZero(line) {
  const nums = line.filter((x) => x !== 0);
  const merged = [];
  let scoreAdd = 0;
  let i = 0;
  while (i < nums.length) {
    if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
      const v = nums[i] * 2;
      scoreAdd += v;
      merged.push(v);
      i += 2;
    } else {
      merged.push(nums[i]);
      i += 1;
    }
  }
  while (merged.length < BOARD_SIZE) merged.push(0);
  return { row: merged.slice(0, BOARD_SIZE), scoreAdd };
}

/**
 * @param {number[][]} a
 * @param {number[][]} b
 * @returns {boolean}
 */
export function boardsEqual(a, b) {
  for (let i = 0; i < BOARD_SIZE; i++) {
    for (let j = 0; j < BOARD_SIZE; j++) {
      if (a[i][j] !== b[i][j]) return false;
    }
  }
  return true;
}

/**
 * @param {number[][]} board
 * @param {Game2048Direction} direction
 * @returns {{ board: number[][]; scoreDelta: number; moved: boolean }}
 */
export function moveBoard(board, direction) {
  const next = board.map((r) => [...r]);
  let scoreDelta = 0;

  if (direction === "left") {
    for (let i = 0; i < BOARD_SIZE; i++) {
      const { row, scoreAdd } = mergeLineTowardZero(next[i]);
      next[i] = row;
      scoreDelta += scoreAdd;
    }
  } else if (direction === "right") {
    for (let i = 0; i < BOARD_SIZE; i++) {
      next[i].reverse();
      const { row, scoreAdd } = mergeLineTowardZero(next[i]);
      next[i] = row;
      next[i].reverse();
      scoreDelta += scoreAdd;
    }
  } else if (direction === "up") {
    for (let j = 0; j < BOARD_SIZE; j++) {
      const col = [];
      for (let i = 0; i < BOARD_SIZE; i++) col.push(next[i][j]);
      const { row, scoreAdd } = mergeLineTowardZero(col);
      scoreDelta += scoreAdd;
      for (let i = 0; i < BOARD_SIZE; i++) next[i][j] = row[i];
    }
  } else if (direction === "down") {
    for (let j = 0; j < BOARD_SIZE; j++) {
      const col = [];
      for (let i = 0; i < BOARD_SIZE; i++) col.push(next[i][j]);
      col.reverse();
      const { row, scoreAdd } = mergeLineTowardZero(col);
      const restored = row.reverse();
      scoreDelta += scoreAdd;
      for (let i = 0; i < BOARD_SIZE; i++) next[i][j] = restored[i];
    }
  } else {
    return { board: next, scoreDelta: 0, moved: false };
  }

  const moved = !boardsEqual(board, next);
  return { board: next, scoreDelta, moved };
}

/**
 * @param {number[][]} board
 * @param {() => number} rng Returns [0,1)
 * @returns {boolean} Whether a tile was placed
 */
export function spawnRandomTile(board, rng = Math.random) {
  const empties = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    for (let j = 0; j < BOARD_SIZE; j++) {
      if (board[i][j] === 0) empties.push([i, j]);
    }
  }
  if (empties.length === 0) return false;
  const pick = empties[Math.floor(rng() * empties.length)];
  board[pick[0]][pick[1]] = rng() < 0.9 ? 2 : 4;
  return true;
}

/**
 * @param {() => number} rng
 * @returns {number[][]}
 */
export function createInitialBoard(rng = Math.random) {
  const b = emptyBoard();
  spawnRandomTile(b, rng);
  spawnRandomTile(b, rng);
  return b;
}

/**
 * @param {number[][]} board
 * @returns {boolean}
 */
export function hasValidMove(board) {
  for (let i = 0; i < BOARD_SIZE; i++) {
    for (let j = 0; j < BOARD_SIZE; j++) {
      if (board[i][j] === 0) return true;
      const v = board[i][j];
      if (j + 1 < BOARD_SIZE && board[i][j + 1] === v) return true;
      if (i + 1 < BOARD_SIZE && board[i + 1][j] === v) return true;
    }
  }
  return false;
}

/**
 * @param {unknown} json
 * @returns {number[][] | null}
 */
export function parseBoard(json) {
  if (!Array.isArray(json) || json.length !== BOARD_SIZE) return null;
  const out = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    const row = json[i];
    if (!Array.isArray(row) || row.length !== BOARD_SIZE) return null;
    const r = [];
    for (let j = 0; j < BOARD_SIZE; j++) {
      const c = row[j];
      if (typeof c !== "number" || !Number.isFinite(c) || !Number.isInteger(c) || c < 0 || c > 1_048_576) {
        return null;
      }
      r.push(c);
    }
    out.push(r);
  }
  return out;
}
