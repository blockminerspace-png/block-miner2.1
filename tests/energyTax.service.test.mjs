import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  brtDayStart,
  lastSevenBrtDays,
  firstTaxableBrtDayStart,
  isTaxableBrtDay,
  isEnergyTaxActive,
  ENERGY_TAX_STARTS_AT,
  DAILY_PER_DAY_RATE,
  AUTO_PER_DAY_RATE,
  FULL_WEEK_RATE,
  DAILY_WEEK_RATE,
} from "#server/modules/energy-tax/energyTax.service.js";

describe("energyTax.service — BRT helpers", () => {
  it("brtDayStart maps UTC instant to 00:00 BRT", () => {
    const d = brtDayStart(new Date("2026-06-30T12:00:00.000Z"));
    assert.equal(d.toISOString(), "2026-06-30T03:00:00.000Z");
  });

  it("lastSevenBrtDays returns 7 days ending today", () => {
    const now = new Date("2026-06-30T15:00:00.000Z");
    const days = lastSevenBrtDays(now);
    assert.equal(days.length, 7);
    assert.equal(days[0].toISOString(), "2026-06-24T03:00:00.000Z");
    assert.equal(days[6].toISOString(), "2026-06-30T03:00:00.000Z");
  });

  it("feature starts at 29/06/2026 21:00 BRT", () => {
    assert.equal(ENERGY_TAX_STARTS_AT.toISOString(), "2026-06-30T00:00:00.000Z");
    assert.equal(isEnergyTaxActive(new Date("2026-06-29T23:59:00.000Z")), false);
    assert.equal(isEnergyTaxActive(new Date("2026-06-30T00:00:00.000Z")), true);
  });

  it("first taxable BRT day is 29/06 calendar day", () => {
    const first = firstTaxableBrtDayStart();
    assert.equal(first.toISOString(), "2026-06-29T03:00:00.000Z");
    assert.equal(isTaxableBrtDay(first), true);
    assert.equal(isTaxableBrtDay(new Date("2026-06-28T03:00:00.000Z")), false);
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
  it("manual pay on Tuesday targets Monday period (yesterday index)", () => {
    const now = new Date("2026-07-01T15:00:00.000Z"); // terça BRT
    const days = lastSevenBrtDays(now);
    const paymentDay = brtDayStart(now);
    const taxedDay = new Date(paymentDay.getTime() - 24 * 60 * 60 * 1000);
    assert.equal(taxedDay.toISOString(), days[5].toISOString());
    assert.equal(paymentDay.toISOString(), days[6].toISOString());
  });

  it("sweep skips today and pre-launch days", () => {
    const now = new Date("2026-06-30T15:00:00.000Z");
    const days = lastSevenBrtDays(now);
    const todayBrt = brtDayStart(now);
    const firstTaxable = firstTaxableBrtDayStart();
    const sweepable = days.filter(
      (d) => d.getTime() >= firstTaxable.getTime() && d.getTime() < todayBrt.getTime(),
    );
    assert.equal(sweepable.length, 1);
    assert.equal(sweepable[0].toISOString(), "2026-06-29T03:00:00.000Z");
  });
});
