/**
 * Global rate limiter for all Etherscan V2 API calls in this process.
 *
 * The free tier allows 3 req/sec on a single key. Both the transparency
 * wallet service and the HD deposit scanner share the same key, so they
 * must coordinate through a single in-process gate.
 *
 * Target: ≤ 1 req / 600 ms (≈ 1.67 req/sec) — well under the 3/sec limit,
 * with enough headroom for occasional bursts from concurrent services.
 */

const MIN_INTERVAL_MS = 600;
let _lastCallAt = 0;
let _pendingRelease: Promise<void> = Promise.resolve();

/**
 * Await this before every Etherscan API fetch.
 * Serialises calls process-wide so the shared key never exceeds the free-tier rate.
 */
export async function etherscanRateLimitWait(): Promise<void> {
  const prev = _pendingRelease;
  let resolve!: () => void;
  _pendingRelease = new Promise<void>((r) => { resolve = r; });

  await prev;

  const now = Date.now();
  const wait = MIN_INTERVAL_MS - (now - _lastCallAt);
  if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
  _lastCallAt = Date.now();
  resolve();
}
