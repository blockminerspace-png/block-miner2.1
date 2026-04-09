/**
 * Unit tests for Auto Mining GPU v2 domain logic (pure functions, TDD).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  MINING_MODES,
  NORMAL_HASH_PER_CYCLE,
  TURBO_HASH_PER_CYCLE,
  CYCLE_SECONDS,
  DAILY_LIMIT_HASH,
  GRANT_TTL_MS,
  CLICK_GRACE_MS,
  MIN_CLICK_DELAY_MS,
  startOfUtcDay,
  isClaimDue,
  canGrantDaily,
  computeExpiresAt,
  validateImpressionForTurboClaim,
  assertValidMiningMode,
  nextClaimAfterSuccess
} from "../server/services/autoMiningV2/autoMiningV2Domain.js";

test("startOfUtcDay returns UTC midnight for the same calendar day", () => {
  const d = new Date("2026-04-09T15:30:00.000Z");
  const s = startOfUtcDay(d);
  assert.equal(s.toISOString(), "2026-04-09T00:00:00.000Z");
});

test("isClaimDue respects server clock and skew tolerance", () => {
  const next = new Date("2026-04-09T12:00:00.000Z");
  assert.equal(isClaimDue(next, new Date("2026-04-09T11:59:55.100Z"), 5000), true);
  assert.equal(isClaimDue(next, new Date("2026-04-09T11:59:54.000Z"), 5000), false);
});

test("canGrantDaily enforces 1000 H/s combined ceiling", () => {
  assert.equal(canGrantDaily(990, NORMAL_HASH_PER_CYCLE, DAILY_LIMIT_HASH), true);
  assert.equal(canGrantDaily(980, TURBO_HASH_PER_CYCLE, DAILY_LIMIT_HASH), true);
  assert.equal(canGrantDaily(996, TURBO_HASH_PER_CYCLE, DAILY_LIMIT_HASH), false);
  assert.equal(canGrantDaily(1000, 1, DAILY_LIMIT_HASH), false);
});

test("computeExpiresAt adds 24h TTL from earned time", () => {
  const earned = new Date("2026-04-09T10:00:00.000Z");
  const exp = computeExpiresAt(earned, GRANT_TTL_MS);
  assert.equal(exp.getTime(), earned.getTime() + GRANT_TTL_MS);
});

test("validateImpressionForTurboClaim rejects missing click", () => {
  const r = validateImpressionForTurboClaim(
    { clickedAt: null, grantId: null, createdAt: new Date() },
    new Date()
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "NOT_CLICKED");
});

test("validateImpressionForTurboClaim rejects already consumed impression", () => {
  const r = validateImpressionForTurboClaim(
    { clickedAt: new Date(), grantId: 1, createdAt: new Date() },
    new Date()
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "ALREADY_CLAIMED");
});

test("validateImpressionForTurboClaim rejects instant click (bot)", () => {
  const created = new Date("2026-04-09T12:00:00.000Z");
  const clicked = new Date(created.getTime() + MIN_CLICK_DELAY_MS - 1);
  const r = validateImpressionForTurboClaim(
    { clickedAt: clicked, grantId: null, createdAt: created },
    new Date(created.getTime() + 1000)
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "CLICK_TOO_FAST");
});

test("validateImpressionForTurboClaim rejects stale impression", () => {
  const created = new Date("2026-04-09T12:00:00.000Z");
  const clicked = new Date(created.getTime() + 2000);
  const now = new Date(created.getTime() + CLICK_GRACE_MS + 1000);
  const r = validateImpressionForTurboClaim(
    { clickedAt: clicked, grantId: null, createdAt: created },
    now
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "IMPRESSION_EXPIRED");
});

test("validateImpressionForTurboClaim accepts valid click", () => {
  const created = new Date("2026-04-09T12:00:00.000Z");
  const clicked = new Date(created.getTime() + MIN_CLICK_DELAY_MS + 50);
  const now = new Date(created.getTime() + 5000);
  const r = validateImpressionForTurboClaim(
    { clickedAt: clicked, grantId: null, createdAt: created },
    now
  );
  assert.equal(r.ok, true);
});

test("assertValidMiningMode accepts NORMAL and TURBO only", () => {
  assert.equal(assertValidMiningMode(MINING_MODES.NORMAL), MINING_MODES.NORMAL);
  assert.equal(assertValidMiningMode(MINING_MODES.TURBO), MINING_MODES.TURBO);
  assert.throws(() => assertValidMiningMode("FAST"), /Invalid mining mode/);
});

test("nextClaimAfterSuccess schedules exactly one cycle ahead", () => {
  const now = new Date("2026-04-09T12:00:00.000Z");
  const n = nextClaimAfterSuccess(now, CYCLE_SECONDS);
  assert.equal(n.getTime(), now.getTime() + CYCLE_SECONDS * 1000);
});

test("constants match product spec", () => {
  assert.equal(NORMAL_HASH_PER_CYCLE, 10);
  assert.equal(TURBO_HASH_PER_CYCLE, 20);
  assert.equal(CYCLE_SECONDS, 60);
  assert.equal(DAILY_LIMIT_HASH, 1000);
});
