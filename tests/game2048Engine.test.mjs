import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
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
  it("mergeLineTowardZero merges adjacent equal tiles once per sweep", () => {
    const { row, scoreAdd } = mergeLineTowardZero([2, 2, 2, 2]);
    assert.deepEqual(row, [4, 4, 0, 0]);
    assert.equal(scoreAdd, 8);
  });

  it("moveBoard merges left", () => {
    const b = [
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ];
    const { board, moved, scoreDelta } = moveBoard(b, "left");
    assert.equal(moved, true);
    assert.equal(scoreDelta, 4);
    assert.equal(board[0][0], 4);
  });

  it("moveBoard returns moved false when nothing changes", () => {
    const b = [
      [2, 4, 8, 16],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ];
    const { moved } = moveBoard(b, "left");
    assert.equal(moved, false);
  });

  it("hasValidMove detects empties and merges", () => {
    assert.equal(hasValidMove(emptyBoard()), true);
    const full = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2]
    ];
    assert.equal(hasValidMove(full), false);
  });

  it("maxTile finds peak", () => {
    assert.equal(
      maxTile([
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 2048]
      ]),
      2048
    );
  });

  it("parseBoard rejects invalid shapes", () => {
    assert.equal(parseBoard(null), null);
    assert.equal(parseBoard([[1, 2]]), null);
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
