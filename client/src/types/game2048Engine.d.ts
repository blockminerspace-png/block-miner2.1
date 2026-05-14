/**
 * Ambient typings for the local / vendored 2048 engine package resolved as `@game2048/engine`.
 */

declare module "@game2048/engine" {
  export type Board2048 = number[][];

  export type Direction2048 = "up" | "down" | "left" | "right";

  /** Standard grid edge length (4×4). */
  export const BOARD_SIZE: number;

  /** Parse wire/board JSON into a numeric grid, or null when invalid. */
  export function parseBoard(raw: unknown): Board2048 | null;

  /** Slide the board in the given direction; returns updated grid and move metadata. */
  export function moveBoard(
    board: Board2048,
    direction: Direction2048,
  ): { board: Board2048; scoreDelta: number; moved: boolean };
}
