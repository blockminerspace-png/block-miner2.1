import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getInternalOfferwallPeriodKey } from "#server/modules/internal-offerwall/internal-offerwall.period.js";
import { computeUsageSnapshot, getOfferLimitConfig } from "#server/services/internalOfferwall/internalOfferwallLimitState.js";
import { RESET_TYPE_COOLDOWN, RESET_TYPE_DAILY } from "#server/services/internalOfferwall/internalOfferwallConstants.js";

describe("internalOfferwallLimitState", () => {
  it("defaults to DAILY reset from empty metadata", () => {
    const cfg = getOfferLimitConfig({ dailyLimitPerUser: 3, taskMetadata: null });
    assert.equal(cfg.resetType, RESET_TYPE_DAILY);
    assert.equal(cfg.maxPerPeriod, 3);
    assert.equal(cfg.cooldownWindowSec, null);
  });

  it("reads COOLDOWN config from taskMetadata", () => {
    const cfg = getOfferLimitConfig({
      dailyLimitPerUser: 2,
      taskMetadata: { resetType: "COOLDOWN", cooldownSeconds: 120 }
    });
    assert.equal(cfg.resetType, RESET_TYPE_COOLDOWN);
    assert.equal(cfg.maxPerPeriod, 2);
    assert.equal(cfg.cooldownWindowSec, 120);
  });

  it("computes daily usage and countdown when at limit", () => {
    const now = new Date("2026-04-13T12:00:00.000Z");
    const periodKey = getInternalOfferwallPeriodKey(now);
    const snap = computeUsageSnapshot({
      resetType: RESET_TYPE_DAILY,
      maxPerPeriod: 3,
      cooldownWindowSec: null,
      completionRows: [
        { periodKey, completedAt: new Date("2026-04-13T10:00:00.000Z") },
        { periodKey, completedAt: new Date("2026-04-13T11:00:00.000Z") },
        { periodKey, completedAt: new Date("2026-04-13T11:30:00.000Z") }
      ],
      periodKey,
      now,
      hasOpenAttempt: false
    });
    assert.equal(snap.completedCount, 3);
    assert.equal(snap.canStartNew, false);
    assert.ok(snap.secondsUntilAvailable != null && snap.secondsUntilAvailable > 0);
  });

  it("allows resume when an open attempt exists even if daily limit is reached", () => {
    const now = new Date("2026-04-13T12:00:00.000Z");
    const periodKey = getInternalOfferwallPeriodKey(now);
    const snap = computeUsageSnapshot({
      resetType: RESET_TYPE_DAILY,
      maxPerPeriod: 1,
      cooldownWindowSec: null,
      completionRows: [{ periodKey, completedAt: new Date("2026-04-13T10:00:00.000Z") }],
      periodKey,
      now,
      hasOpenAttempt: true
    });
    assert.equal(snap.canStartNew, true);
    assert.equal(snap.secondsUntilAvailable, null);
  });

  it("computes rolling cooldown unblock time", () => {
    const now = new Date("2026-04-13T12:00:00.000Z");
    const periodKey = getInternalOfferwallPeriodKey(now);
    const windowSec = 3600;
    const t0 = new Date("2026-04-13T11:30:00.000Z");
    const t1 = new Date("2026-04-13T11:45:00.000Z");
    const t2 = new Date("2026-04-13T11:50:00.000Z");
    const snap = computeUsageSnapshot({
      resetType: RESET_TYPE_COOLDOWN,
      maxPerPeriod: 2,
      cooldownWindowSec: windowSec,
      completionRows: [
        { periodKey, completedAt: t0 },
        { periodKey, completedAt: t1 },
        { periodKey, completedAt: t2 }
      ],
      periodKey,
      now,
      hasOpenAttempt: false
    });
    assert.equal(snap.completedCount, 3);
    assert.equal(snap.canStartNew, false);
    const expectedBoundary = t1.getTime() + windowSec * 1000;
    assert.equal(snap.secondsUntilAvailable, Math.max(0, Math.ceil((expectedBoundary - now.getTime()) / 1000)));
  });
});
