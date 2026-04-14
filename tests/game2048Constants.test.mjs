import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  game2048TimeLimitSec,
  game2048MinScore,
  game2048RewardHashRate,
} from "../server/utils/game2048Constants.js";

describe("game2048Constants", () => {
  afterEach(() => {
    delete process.env.GAME2048_TIME_LIMIT_SEC;
    delete process.env.GAME2048_MIN_SCORE;
    delete process.env.GAME2048_REWARD_HASHRATE;
  });

  it("game2048TimeLimitSec defaults to 180", () => {
    delete process.env.GAME2048_TIME_LIMIT_SEC;
    assert.equal(game2048TimeLimitSec(), 180);
  });

  it("game2048TimeLimitSec accepts 0 to disable", () => {
    process.env.GAME2048_TIME_LIMIT_SEC = "0";
    assert.equal(game2048TimeLimitSec(), 0);
  });

  it("game2048TimeLimitSec clamps to 3600", () => {
    process.env.GAME2048_TIME_LIMIT_SEC = "999999";
    assert.equal(game2048TimeLimitSec(), 3600);
  });

  it("game2048MinScore defaults to 1000", () => {
    delete process.env.GAME2048_MIN_SCORE;
    assert.equal(game2048MinScore(), 1000);
  });

  it("game2048RewardHashRate defaults to 25", () => {
    delete process.env.GAME2048_REWARD_HASHRATE;
    assert.equal(game2048RewardHashRate(), 25);
  });
});
