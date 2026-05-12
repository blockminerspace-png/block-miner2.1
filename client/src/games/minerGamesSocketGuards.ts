/** Slugs accepted by `registerGamesSocketHandlers` for `game:start`. */
export type MinerSocketGameSlug = 'crypto-memory' | 'crypto-match-3' | 'cart-rush';

const SLUGS = new Set<string>(['crypto-memory', 'crypto-match-3', 'cart-rush']);

export function isMinerSocketGameSlug(value: unknown): value is MinerSocketGameSlug {
  return typeof value === 'string' && SLUGS.has(value);
}

/**
 * Limits duplicate `game:start` while a handshake is in flight and throttles
 * high-frequency `game:action` lane updates (cart) to reduce noise and double taps.
 */
export function createMinerGamesSocketGuard(options?: { laneEmitMinMs?: number }) {
  const laneMin = Math.max(0, options?.laneEmitMinMs ?? 88);
  let startPending = false;
  let lastLaneEmit = 0;

  return {
    tryBeginStart(): boolean {
      if (startPending) return false;
      startPending = true;
      return true;
    },
    releaseStart(): void {
      startPending = false;
    },
    tryEmitLane(): boolean {
      const now = performance.now();
      if (now - lastLaneEmit < laneMin) return false;
      lastLaneEmit = now;
      return true;
    },
  };
}

export type MinerGamesSocketGuard = ReturnType<typeof createMinerGamesSocketGuard>;
