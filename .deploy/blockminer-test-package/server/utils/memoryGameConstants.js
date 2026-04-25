/**
 * Memory game (crypto-memory) server tuning.
 * After the second card finishes its flip animation (~300ms), the pair stays fully open for this many
 * milliseconds before the server tells the client to flip them back.
 * @returns {number} Hold duration in ms (clamped).
 */
export function getMemoryMismatchRevealMs() {
  const raw = Number(process.env.MEMORY_MISMATCH_REVEAL_MS);
  const fallback = 800;
  const n = Number.isFinite(raw) && raw > 0 ? raw : fallback;
  return Math.min(1500, Math.max(500, n));
}
