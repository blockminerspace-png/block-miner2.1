/**
 * Power Boost — reward duration, entitlement expiry, and activation rules.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  BOOST_COST_POL,
  BOOST_DURATION_HOURS,
  BOOST_TTL_MS,
  NORMAL_DURATION_HOURS,
  NORMAL_TTL_MS,
  boostEntitlementExpiresAt,
  computeRewardExpiresAt,
  formatRewardDurationPt,
  getRewardDurationMsTx,
  hasActiveBoostTx,
  rewardDurationHoursFromMs,
  todayKeyUTC,
} from "#server/services/powerBoostService.js";

test("scenario 1: without Power Boost, faucet reward expires in exactly 24h", async () => {
  const earnedAt = new Date("2026-07-03T08:00:00.000Z");
  const tx = {
    dailyPowerBoost: {
      findUnique: async () => null,
    },
  };
  const ttlMs = await getRewardDurationMsTx(tx, 1, "faucet");
  const expiresAt = computeRewardExpiresAt(earnedAt, ttlMs);
  assert.equal(ttlMs, NORMAL_TTL_MS);
  assert.equal(expiresAt.getTime() - earnedAt.getTime(), 24 * 60 * 60 * 1000);
  assert.equal(rewardDurationHoursFromMs(ttlMs), NORMAL_DURATION_HOURS);
});

test("scenario 2: with Power Boost, faucet reward expires in exactly 7 days", async () => {
  const earnedAt = new Date("2026-07-03T08:00:00.000Z");
  const tx = {
    dailyPowerBoost: {
      findUnique: async () => ({ id: 99 }),
    },
  };
  const ttlMs = await getRewardDurationMsTx(tx, 1, "faucet");
  const expiresAt = computeRewardExpiresAt(earnedAt, ttlMs);
  assert.equal(ttlMs, BOOST_TTL_MS);
  assert.equal(expiresAt.getTime() - earnedAt.getTime(), 7 * 24 * 60 * 60 * 1000);
  assert.equal(rewardDurationHoursFromMs(ttlMs), BOOST_DURATION_HOURS);
});

test("scenario 3: with Power Boost, YouTube uses same 7-day TTL", async () => {
  const earnedAt = new Date("2026-07-03T10:00:00.000Z");
  const tx = {
    dailyPowerBoost: {
      findUnique: async () => ({ id: 1 }),
    },
  };
  const ttlMs = await getRewardDurationMsTx(tx, 42, "youtube");
  const expiresAt = computeRewardExpiresAt(earnedAt, ttlMs);
  assert.equal(ttlMs, BOOST_TTL_MS);
  assert.equal(expiresAt.toISOString(), "2026-07-10T10:00:00.000Z");
});

test("scenario 4: after Power Boost entitlement ends, new rewards use 24h", async () => {
  const earnedAt = new Date("2026-07-04T01:00:00.000Z");
  const tx = {
    dailyPowerBoost: {
      findUnique: async () => null,
    },
  };
  const ttlMs = await getRewardDurationMsTx(tx, 1, "autoMining");
  assert.equal(ttlMs, NORMAL_TTL_MS);
  assert.equal(computeRewardExpiresAt(earnedAt, ttlMs).toISOString(), "2026-07-05T01:00:00.000Z");
});

test("scenario 5: multiple rewards each get independent expiresAt", async () => {
  const tx = {
    dailyPowerBoost: {
      findUnique: async () => ({ id: 1 }),
    },
  };
  const ttlMs = await getRewardDurationMsTx(tx, 1, "faucet");
  const t1 = new Date("2026-07-03T08:00:00.000Z");
  const t2 = new Date("2026-07-03T10:00:00.000Z");
  const e1 = computeRewardExpiresAt(t1, ttlMs);
  const e2 = computeRewardExpiresAt(t2, ttlMs);
  assert.notEqual(e1.getTime(), e2.getTime());
  assert.equal(e2.getTime() - e1.getTime(), 2 * 60 * 60 * 1000);
});

test("scenario 6: re-activation same UTC day is blocked (replace, not stack)", async () => {
  const dayKey = todayKeyUTC(new Date("2026-07-03T15:00:00.000Z"));
  const tx = {
    dailyPowerBoost: {
      findUnique: async () => ({ id: 5 }),
    },
  };
  assert.equal(await hasActiveBoostTx(tx, 9, dayKey), true);
  assert.equal(BOOST_COST_POL, 0.01);
});

test("Power Boost entitlement expires at next UTC midnight", () => {
  const now = new Date("2026-07-03T23:59:00.000Z");
  const exp = boostEntitlementExpiresAt(now);
  assert.equal(exp.toISOString(), "2026-07-04T00:00:00.000Z");
});

test("formatRewardDurationPt labels 24h and 7 days", () => {
  assert.equal(formatRewardDurationPt(NORMAL_TTL_MS), "24 horas");
  assert.equal(formatRewardDurationPt(BOOST_TTL_MS), "7 dias");
});
