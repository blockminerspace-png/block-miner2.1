/**
 * Client-side helpers for Chain 2048 UI (board mirrors server state).
 * Keeps progress / “best tile” math safe when the grid is empty or oddly shaped.
 */

/**
 * @param {unknown} board
 * @returns {number} Highest tile value on the board, or 0 if none / invalid.
 */
export function bestTileOnBoard(board) {
  if (!Array.isArray(board) || board.length === 0) return 0;
  let best = 0;
  for (const row of board) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      const v = typeof cell === "number" ? cell : Number(cell);
      if (Number.isFinite(v) && v > best) best = v;
    }
  }
  return best;
}

/**
 * Progress toward the configured win tile (log scale), for the header bar.
 * @param {number} bestTile
 * @param {number} winTile
 * @returns {number} 0–100
 */
export function mergeProgressPercent(bestTile, winTile) {
  if (!winTile || winTile < 2) return 0;
  if (!bestTile || bestTile < 2) return 0;
  if (bestTile >= winTile) return 100;
  const num = Math.log2(bestTile);
  const den = Math.log2(winTile);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return 0;
  return Math.min(100, Math.max(0, (num / den) * 100));
}
