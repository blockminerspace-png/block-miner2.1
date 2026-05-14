import type { MiningEngine } from "../miningEngine.js";

let miningEngine: MiningEngine | null = null;

export function setMiningEngine(engine: MiningEngine | null): void {
  miningEngine = engine;
}

export function getMiningEngine(): MiningEngine | null {
  return miningEngine;
}

/**
 * Applies a balance delta to the in-memory mining engine snapshot (real-time UI / reward math).
 * The database `users.pol_balance` is the source of truth for settled funds; this helper only
 * mutates the live miner object and advances `lastPersistedBalance` so `persistMinerProfile` does
 * not re-send the same delta to SQL.
 *
 * After any flow that mutates POL directly in the database (shop, vault moves, deposits), call
 * `reloadMinerProfile(userId)` so the engine converges with `pol_balance`.
 */
export function applyUserBalanceDelta(userId: number, delta: number): void {
  if (!miningEngine) return;
  const miner = miningEngine.findMinerByUserId(userId);
  if (miner) {
    miner.balance += delta;
    miner.lastPersistedBalance = (miner.lastPersistedBalance ?? miner.balance - delta) + delta;
  }
}
