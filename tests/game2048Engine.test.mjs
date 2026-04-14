import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_SIZE,
  boardsEqual,
  createInitialBoard,
  emptyBoard,
  hasValidMove,
  maxTile,
  mergeLineTowardZero,
  moveBoard,
  parseBoard
} from "../server/services/game2048Engine.js";

describe("game2048Engine", () => {
  it("uses a 4x4 board", () => {
    const b = emptyBoard();
    assert.equal(b.length, BOARD_SIZE);
    assert.equal(b[0].length, BOARD_SIZE);
    assert.equal(BOARD_SIZE, 4);
  });

  it("mergeLineTowardZero merges adjacent equal tiles once per sweep", () => {
    const { row, scoreAdd } = mergeLineTowardZero([2, 2, 2, 2]);
    assert.deepEqual(row, [4, 4, 0, 0]);
    assert.equal(scoreAdd, 8);
  });

  it("moveBoard merges left", () => {
    const b = emptyBoard();
    b[0][0] = 2;
    b[0][1] = 2;
    const { board, moved, scoreDelta } = moveBoard(b, "left");
    assert.equal(moved, true);
    assert.equal(scoreDelta, 4);
    assert.equal(board[0][0], 4);
  });

  it("moveBoard returns moved false when nothing changes", () => {
    const b = emptyBoard();
    b[0][0] = 2;
    b[0][1] = 4;
    b[0][2] = 8;
    b[0][3] = 16;
    const { moved } = moveBoard(b, "left");
    assert.equal(moved, false);
  });

  it("hasValidMove detects empties and merges", () => {
    assert.equal(hasValidMove(emptyBoard()), true);
    const full = emptyBoard();
    for (let i = 0; i < BOARD_SIZE; i++) {
      for (let j = 0; j < BOARD_SIZE; j++) {
        full[i][j] = (i + j) % 2 === 0 ? 2 : 4;
      }
    }
    assert.equal(hasValidMove(full), false);
  });

  it("maxTile finds peak", () => {
    const b = emptyBoard();
    b[3][3] = 2048;
    assert.equal(maxTile(b), 2048);
  });

  it("parseBoard rejects invalid shapes", () => {
    assert.equal(parseBoard(null), null);
    assert.equal(parseBoard([[1, 2]]), null);
    const eight = Array.from({ length: 8 }, () => Array(8).fill(0));
    assert.equal(parseBoard(eight), null);
  });

  it("parseBoard accepts valid 4x4 board", () => {
    const valid = Array.from({ length: 4 }, () => Array(4).fill(0));
    const parsed = parseBoard(valid);
    assert.ok(parsed);
    assert.equal(parsed.length, 4);
    assert.equal(parsed[0].length, 4);
  });

  it("createInitialBoard places two non-zero tiles", () => {
    const rng = () => 0.01;
    const b = createInitialBoard(rng);
    let count = 0;
    for (const row of b) for (const c of row) if (c !== 0) count += 1;
    assert.equal(count, 2);
  });

  it("boardsEqual compares grids", () => {
    const a = emptyBoard();
    const b = emptyBoard();
    assert.equal(boardsEqual(a, b), true);
    a[0][0] = 2;
    assert.equal(boardsEqual(a, b), false);
  });
});
