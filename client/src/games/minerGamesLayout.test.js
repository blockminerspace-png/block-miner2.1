import { describe, it, expect } from "vitest";
import {
  MINER_GAMES_LOGICAL_SIZE,
  getMemoryGridLayout,
  hitTestMemoryCardIndex,
  getMatch3GridLayout,
  hitTestMatch3Cell,
} from "./minerGamesLayout.js";

describe("minerGamesLayout", () => {
  it("uses the same origin as legacy Games.jsx (500 logical canvas)", () => {
    const L = getMemoryGridLayout(500);
    expect(L.sx).toBe(10);
    expect(L.sy).toBe(10);
  });

  it("hitTestMemoryCardIndex returns corners and center of top-left card", () => {
    const L = getMemoryGridLayout();
    expect(hitTestMemoryCardIndex(L.sx, L.sy, L)).toBe(0);
    expect(hitTestMemoryCardIndex(L.sx + L.size, L.sy + L.size, L)).toBe(0);
    expect(hitTestMemoryCardIndex(L.sx + L.size / 2, L.sy + L.size / 2, L)).toBe(0);
  });

  it("hitTestMemoryCardIndex returns null in padding gutters and outside grid", () => {
    const L = getMemoryGridLayout();
    const gutterX = L.sx + L.size + L.padding / 2;
    const gutterY = L.sy + L.size / 2;
    expect(hitTestMemoryCardIndex(gutterX, gutterY, L)).toBeNull();
    expect(hitTestMemoryCardIndex(0, 0, L)).toBeNull();
    expect(hitTestMemoryCardIndex(MINER_GAMES_LOGICAL_SIZE, MINER_GAMES_LOGICAL_SIZE, L)).toBeNull();
  });

  it("hitTestMemoryCardIndex maps bottom-right card to index 15", () => {
    const L = getMemoryGridLayout();
    const col = 3;
    const row = 3;
    const x = L.sx + col * L.stride + L.size / 2;
    const y = L.sy + row * L.stride + L.size / 2;
    expect(hitTestMemoryCardIndex(x, y, L)).toBe(15);
  });

  it("hitTestMatch3Cell returns (0,0) for top-left cell center", () => {
    const L = getMatch3GridLayout();
    const x = L.sx + L.cellSize / 2;
    const y = L.sy + L.cellSize / 2;
    expect(hitTestMatch3Cell(x, y, L)).toEqual({ cx: 0, cy: 0 });
  });

  it("hitTestMatch3Cell returns null outside board", () => {
    expect(hitTestMatch3Cell(0, 0)).toBeNull();
    expect(hitTestMatch3Cell(MINER_GAMES_LOGICAL_SIZE, MINER_GAMES_LOGICAL_SIZE)).toBeNull();
  });
});
