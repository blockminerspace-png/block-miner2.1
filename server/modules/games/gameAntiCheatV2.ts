/**
 * Anti-cheat V2 — trust score system.
 *
 * Each suspicious signal reduces the trust score from 100.
 * We only reject if score drops below REJECT_THRESHOLD (30).
 * This prevents false positives from single GC pauses, lag spikes, etc.
 *
 * Game-specific minimum durations replace the flat 15s floor.
 */

export const REJECT_THRESHOLD = 30;

/** Minimum play time in ms per game slug before a win is considered valid. */
export const GAME_MIN_DURATION_MS: Record<string, number> = {
  "crypto-memory": 25_000,  // 8 pairs, each flip takes at least a few seconds
  "crypto-match-3": 20_000, // 1500 pts via cascades, each swap ~2-4s
  "cart-rush": 8_000,       // fallback; cart-rush uses physics-based evaluateCartRushTrust
  "block-stack": 14_000,    // 8 blocks; theoretically ~15.2s but give 1s slack
  "sky-runner": 14_000,     // checkpoint validation already covers this
};

const CART_TICK_MS = 200;
const CART_COIN_POINTS = 50;
/** Loose floor per collected coin (spawn + travel to collision). */
const CART_MIN_MS_PER_COIN = 1_200;
/** Absolute floor — instant wins are impossible on the server tick loop. */
const CART_ABSOLUTE_MIN_MS = 8_000;

export type AntiCheatEvent =
  | "timing_below_minimum"   // play time < game minimum
  | "score_anomaly"          // score outside expected range
  | "replay_detected";       // duplicate completion attempt

const EVENT_DEDUCTIONS: Record<AntiCheatEvent, number> = {
  timing_below_minimum: 80,  // nearly always cheating
  score_anomaly: 40,
  replay_detected: 100,
};

export interface TrustResult {
  trustScore: number;
  rejected: boolean;
  events: AntiCheatEvent[];
}

/**
 * Cart Rush is server-ticked: distance grows 10m every 200ms and coins grant +50.
 * A flat 30s floor rejected legit coin-heavy wins (~12–22s). Use tick physics instead.
 */
export function evaluateCartRushTrust(
  elapsedMs: number,
  distance: number,
  btcCount: number,
  score: number,
): TrustResult {
  let trustScore = 100;
  const events: AntiCheatEvent[] = [];

  const safeElapsed = Math.max(0, elapsedMs);
  const safeDistance = Math.max(0, distance);
  const safeBtc = Math.max(0, btcCount);
  const distanceScore = Math.floor(safeDistance / 10);
  const expectedScore = distanceScore + safeBtc * CART_COIN_POINTS;

  const minFromDistance = distanceScore * CART_TICK_MS * 0.8;
  const minFromCoins = safeBtc * CART_MIN_MS_PER_COIN;
  const minRequired = Math.max(CART_ABSOLUTE_MIN_MS, minFromDistance, minFromCoins);

  if (safeElapsed < minRequired) {
    events.push("timing_below_minimum");
    trustScore -= EVENT_DEDUCTIONS.timing_below_minimum;
  }

  if (score <= 0 || Math.abs(score - expectedScore) > 2) {
    events.push("score_anomaly");
    trustScore -= EVENT_DEDUCTIONS.score_anomaly;
  }

  return {
    trustScore: Math.max(0, trustScore),
    rejected: trustScore < REJECT_THRESHOLD,
    events,
  };
}

export function evaluateTrust(
  gameSlug: string,
  playTimeMs: number,
  score: number,
): TrustResult {
  let trustScore = 100;
  const events: AntiCheatEvent[] = [];

  const minMs = GAME_MIN_DURATION_MS[gameSlug] ?? 15_000;
  if (playTimeMs < minMs) {
    events.push("timing_below_minimum");
    trustScore -= EVENT_DEDUCTIONS.timing_below_minimum;
  }

  // Score sanity: if score is 0 on a "success" that's suspicious
  if (score <= 0) {
    events.push("score_anomaly");
    trustScore -= EVENT_DEDUCTIONS.score_anomaly;
  }

  return {
    trustScore: Math.max(0, trustScore),
    rejected: trustScore < REJECT_THRESHOLD,
    events,
  };
}
