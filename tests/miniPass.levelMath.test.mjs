import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computePassLevel,
  xpCapForSeason,
  xpRemainingToCap
} from "#server/services/miniPass/miniPassLevelMath.js";

describe("miniPassLevelMath", () => {
  it("computes level from XP with floor division", () => {
    assert.equal(computePassLevel(0, 100, 10), 1);
    assert.equal(computePassLevel(99, 100, 10), 1);
    assert.equal(computePassLevel(100, 100, 10), 2);
    assert.equal(computePassLevel(900, 100, 10), 10);
    assert.equal(computePassLevel(5000, 100, 10), 10);
  });

  it("caps XP total for max tier", () => {
    assert.equal(xpCapForSeason(10, 100), 900);
    assert.equal(xpRemainingToCap(100, 10, 100), 800);
    assert.equal(xpRemainingToCap(900, 10, 100), 0);
  });
});
