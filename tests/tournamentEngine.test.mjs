import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeUsdValue } from "#server/modules/pricing/internal-price-oracle.js";
import { countsForDepositTournament } from "#server/modules/tournaments/infrastructure/deposit/deposit-valuation.service.js";
import { windowContains } from "#server/modules/tournaments/domain/types.js";
import { DepositUsdScorer, DepositPolScorer } from "#server/modules/tournaments/domain/metrics/deposit.scorer.js";
import { depositConfirmedIdempotencyKey } from "#server/modules/tournaments/domain/events/deposit-confirmed.event.js";

describe("tournament engine — pricing", () => {
  it("computeUsdValue rounds to 8 decimals", () => {
    const v = computeUsdValue(10, 0.123456789);
    assert.equal(v, 1.23456789);
  });
});

describe("tournament engine — deposit eligibility", () => {
  it("excludes hd_deposit from tournaments", () => {
    assert.equal(countsForDepositTournament("hd_deposit"), false);
    assert.equal(countsForDepositTournament("treasury"), true);
    assert.equal(countsForDepositTournament("contract"), true);
  });
});

describe("tournament engine — window", () => {
  it("windowContains respects upper bound", () => {
    const startsAt = new Date("2026-07-01T00:00:00.000Z");
    const endsAt = new Date("2026-07-02T00:00:00.000Z");
    const eventAt = new Date("2026-07-01T12:00:00.000Z");
    const upper = new Date("2026-07-01T06:00:00.000Z");
    assert.equal(windowContains({ startsAt, endsAt }, eventAt), true);
    assert.equal(windowContains({ startsAt, endsAt }, eventAt, upper), false);
  });
});

describe("tournament engine — deposit scorers", () => {
  const tournament = {
    id: 1,
    name: "Test",
    metric: "DEPOSITS_USD",
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-07-02T00:00:00.000Z"),
    status: "ACTIVE",
  };

  const payload = {
    transactionId: 42,
    userId: 7,
    polAmount: 5,
    usdValue: 1.25,
    usdRate: 0.25,
    eventAt: "2026-07-01T12:00:00.000Z",
    source: "treasury",
    countsForTournament: true,
    txHash: "0xabc",
  };

  it("DepositUsdScorer returns contribution in window", () => {
    const scorer = new DepositUsdScorer();
    const delta = scorer.onDepositConfirmed(payload, tournament);
    assert.ok(delta);
    assert.equal(delta.metricValue, 1.25);
    assert.equal(delta.sourceId, "42");
  });

  it("DepositUsdScorer skips hd_deposit", () => {
    const scorer = new DepositUsdScorer();
    const delta = scorer.onDepositConfirmed(
      { ...payload, countsForTournament: false, source: "hd_deposit" },
      tournament,
    );
    assert.equal(delta, null);
  });

  it("DepositPolScorer uses pol amount", () => {
    const polTournament = { ...tournament, metric: "DEPOSITS_POL" };
    const scorer = new DepositPolScorer();
    const delta = scorer.onDepositConfirmed(payload, polTournament);
    assert.ok(delta);
    assert.equal(delta.metricValue, 5);
  });

  it("deposit idempotency key is stable", () => {
    assert.equal(depositConfirmedIdempotencyKey(99), "deposit_confirmed:99");
  });
});
