import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimateNetworkHashRateHs, HS_PER_ACTIVE_RIG, MIN_NETWORK_HS } from "../server/services/publicLiveStatsService.js";

describe("publicLiveStatsService helpers", () => {
  it("estimateNetworkHashRateHs uses floor and landing-style minimum", () => {
    assert.equal(estimateNetworkHashRateHs(0), MIN_NETWORK_HS);
    assert.equal(estimateNetworkHashRateHs(1), Math.max(HS_PER_ACTIVE_RIG, MIN_NETWORK_HS));
    assert.equal(estimateNetworkHashRateHs(7), Math.max(7 * HS_PER_ACTIVE_RIG, MIN_NETWORK_HS));
  });
});
