import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  game2048TimeLimitSec,
  game2048MinScore,
  game2048RewardHashRate,
  game2048PowerHoursWhenNoDailyLogin,
  rewardDurationFromCheckinToday
} from "#server/utils/game2048Constants.js";

describe("game2048Constants", () => {
  afterEach(() => {
    delete process.env.GAME2048_TIME_LIMIT_SEC;
    delete process.env.GAME2048_MIN_SCORE;
    delete process.env.GAME2048_REWARD_HASHRATE;
    delete process.env.GAME2048_POWER_HOURS_NO_CHECKIN;
    delete process.env.GAME2048_POWER_DAYS;
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

  it("game2048MinScore defaults to 500", () => {
    delete process.env.GAME2048_MIN_SCORE;
    assert.equal(game2048MinScore(), 500);
  });

  it("game2048RewardHashRate defaults to 25", () => {
    delete process.env.GAME2048_REWARD_HASHRATE;
    assert.equal(game2048RewardHashRate(), 25);
  });

  it("game2048PowerHoursWhenNoDailyLogin defaults to 24", () => {
    delete process.env.GAME2048_POWER_HOURS_NO_CHECKIN;
    assert.equal(game2048PowerHoursWhenNoDailyLogin(), 24);
  });

  it("rewardDurationFromCheckinToday uses days when check-in confirmed", () => {
    process.env.GAME2048_POWER_DAYS = "7";
    const r = rewardDurationFromCheckinToday(true);
    assert.equal(r.rewardPowerDays, 7);
    assert.equal(r.rewardPowerHours, null);
    assert.equal(r.rewardTtlMs, 7 * 86_400_000);
  });

  it("rewardDurationFromCheckinToday uses hours when no check-in", () => {
    process.env.GAME2048_POWER_HOURS_NO_CHECKIN = "24";
    const r = rewardDurationFromCheckinToday(false);
    assert.equal(r.rewardPowerDays, null);
    assert.equal(r.rewardPowerHours, 24);
    assert.equal(r.rewardTtlMs, 24 * 3_600_000);
  });
});
