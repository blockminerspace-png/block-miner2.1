import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeDepositSummary,
  depositRankingUnit,
} from "#server/modules/tournaments/depositTournamentPresentation.js";

describe("depositTournamentPresentation", () => {
  it("normalizes USD summary with ranking unit", () => {
    const out = normalizeDepositSummary("DEPOSITS_USD", {
      totalUsd: 12.54,
      totalPol: 56.23,
      txCount: 3,
      participantCount: 2,
      largestDepositUsd: 8,
      largestDepositPol: 40,
      remainderUsd: 4.54,
      remainderPol: 16.23,
      remainderTxCount: 2,
    });
    assert.equal(out?.rankingUnit, "usd");
    assert.equal(out?.totalUsd, 12.54);
    assert.equal(out?.totalPol, 56.23);
  });

  it("marks legacy POL tournaments", () => {
    assert.equal(depositRankingUnit("DEPOSITS_POL"), "pol_legacy");
    assert.equal(depositRankingUnit("DEPOSITS_USD"), "usd");
  });
});
