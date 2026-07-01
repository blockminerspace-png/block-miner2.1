import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  brtDayStart,
  miningPeriodStart,
  miningPeriodEndKey,
  lastClosedMiningPeriodStart,
  lastSevenBrtDays,
  lastSevenMiningPeriodStarts,
  firstTaxableBrtDayStart,
  isTaxableBrtDay,
  isEnergyTaxActive,
  ENERGY_TAX_STARTS_AT,
  DAILY_PER_DAY_RATE,
  AUTO_PER_DAY_RATE,
  FULL_WEEK_RATE,
  DAILY_WEEK_RATE,
} from "#server/modules/energy-tax/energyTax.service.js";

describe("energyTax.service — 21h mining period helpers", () => {
  it("mining period rolls at 21h BRT (same as check-in)", () => {
    // 30/06 23:44 BRT = 2026-07-01T02:44:00Z → período corrente termina 01/07
    const late = new Date("2026-07-01T02:44:00.000Z");
    assert.equal(miningPeriodEndKey(late), "2026-07-01");
    assert.equal(miningPeriodStart(late).toISOString(), "2026-07-01T00:00:00.000Z");

    // 30/06 20:00 BRT = 2026-06-30T23:00:00Z → ainda no período que termina 30/06
    const beforeReset = new Date("2026-06-30T23:00:00.000Z");
    assert.equal(miningPeriodEndKey(beforeReset), "2026-06-30");
    assert.equal(miningPeriodStart(beforeReset).toISOString(), "2026-06-30T00:00:00.000Z");
  });

  it("last closed period after 21h is the civil day that just ended", () => {
    const afterReset = new Date("2026-07-01T02:44:00.000Z"); // 30/06 23:44 BRT
    assert.equal(lastClosedMiningPeriodStart(afterReset).toISOString(), "2026-06-30T00:00:00.000Z");
  });

  it("lastSevenMiningPeriodStarts returns 7 period starts ending in current period", () => {
    const now = new Date("2026-07-01T02:44:00.000Z");
    const days = lastSevenMiningPeriodStarts(now);
    assert.equal(days.length, 7);
    assert.equal(days[0].toISOString(), "2026-06-25T00:00:00.000Z");
    assert.equal(days[6].toISOString(), "2026-07-01T00:00:00.000Z");
    assert.deepEqual(days, lastSevenBrtDays(now));
  });

  it("feature starts at 29/06/2026 21:00 BRT", () => {
    assert.equal(ENERGY_TAX_STARTS_AT.toISOString(), "2026-06-30T00:00:00.000Z");
    assert.equal(isEnergyTaxActive(new Date("2026-06-29T23:59:00.000Z")), false);
    assert.equal(isEnergyTaxActive(new Date("2026-06-30T00:00:00.000Z")), true);
  });

  it("first taxable period is launch period (end 30/06)", () => {
    const first = firstTaxableBrtDayStart();
    assert.equal(first.toISOString(), "2026-06-30T00:00:00.000Z");
    assert.equal(isTaxableBrtDay(first), true);
    assert.equal(isTaxableBrtDay(new Date("2026-06-29T00:00:00.000Z")), false);
  });

  it("brtDayStart is alias for miningPeriodStart", () => {
    const now = new Date("2026-07-01T02:44:00.000Z");
    assert.equal(brtDayStart(now).toISOString(), miningPeriodStart(now).toISOString());
  });
});

describe("energyTax.service — rate constants", () => {
  it("daily and auto per-day rates sum to weekly totals", () => {
    assert.ok(Math.abs(DAILY_PER_DAY_RATE * 7 - DAILY_WEEK_RATE) < 1e-10);
    assert.ok(Math.abs(AUTO_PER_DAY_RATE * 7 - FULL_WEEK_RATE) < 1e-10);
    assert.ok(Math.abs(DAILY_PER_DAY_RATE * 100 - 0.7142857142857143) < 1e-6);
    assert.ok(Math.abs(AUTO_PER_DAY_RATE * 100 - 2.142857142857143) < 1e-6);
  });
});

describe("energyTax.service — pay vs sweep day alignment (spec)", () => {
  it("manual pay after 21h targets last closed period", () => {
    const now = new Date("2026-07-01T02:44:00.000Z"); // 30/06 23:44 BRT
    const taxedDay = lastClosedMiningPeriodStart(now);
    assert.equal(taxedDay.toISOString(), "2026-06-30T00:00:00.000Z");
    const days = lastSevenMiningPeriodStarts(now);
    assert.equal(taxedDay.toISOString(), days[5].toISOString());
  });

  it("sweep skips current open period and pre-launch", () => {
    const now = new Date("2026-07-01T02:44:00.000Z");
    const days = lastSevenMiningPeriodStarts(now);
    const openStart = miningPeriodStart(now);
    const firstTaxable = firstTaxableBrtDayStart();
    const sweepable = days.filter(
      (d) => d.getTime() >= firstTaxable.getTime() && d.getTime() < openStart.getTime(),
    );
    assert.equal(sweepable.length, 1);
    assert.equal(sweepable[0].toISOString(), "2026-06-30T00:00:00.000Z");
  });
});
