/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { bestTileOnBoard, mergeProgressPercent } from "./game2048BoardUtils.js";

describe("game2048BoardUtils", () => {
  it("bestTileOnBoard returns 0 for empty or invalid input", () => {
    expect(bestTileOnBoard(null)).toBe(0);
    expect(bestTileOnBoard([])).toBe(0);
    expect(bestTileOnBoard([[]])).toBe(0);
  });

  it("bestTileOnBoard ignores -Infinity from empty flat grids", () => {
    const weird = [[], []];
    expect(bestTileOnBoard(weird)).toBe(0);
  });

  it("bestTileOnBoard finds the maximum including string cells", () => {
    const board = [
      [2, "4", 0, 0],
      [0, 0, 128, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0]
    ];
    expect(bestTileOnBoard(board)).toBe(128);
  });

  it("mergeProgressPercent scales by log2 toward win tile", () => {
    expect(mergeProgressPercent(0, 2048)).toBe(0);
    expect(mergeProgressPercent(2, 2048)).toBeGreaterThan(0);
    expect(mergeProgressPercent(2048, 2048)).toBe(100);
    expect(mergeProgressPercent(4096, 2048)).toBe(100);
  });
});
