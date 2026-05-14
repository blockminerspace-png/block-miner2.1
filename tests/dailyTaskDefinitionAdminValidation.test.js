import test from "node:test";
import assert from "node:assert/strict";
import { parseCreateDailyTaskDefinition } from "#server/services/dailyTasks/dailyTaskDefinitionAdminValidation.js";

test("parseCreate rejects invalid slug", () => {
  const r = parseCreateDailyTaskDefinition({ slug: "BAD_SLUG", taskType: "LOGIN_DAY", targetValue: 1, translationKey: "dailyTasks.tasks.x", rewardKind: "BLK", rewardBlkAmount: 0.01 });
  assert.equal(r.ok, false);
});

test("parseCreate accepts minimal BLK task with autoSortOrder", () => {
  const r = parseCreateDailyTaskDefinition({
    slug: "daily-test-task",
    taskType: "MINE_BLK",
    targetValue: 0.05,
    translationKey: "dailyTasks.tasks.mine_blk",
    rewardKind: "BLK",
    rewardBlkAmount: 0.02,
    autoSortOrder: true
  });
  assert.equal(r.ok, true);
  assert.equal(r.autoSortOrder, true);
  assert.equal(r.data.slug, "daily-test-task");
  assert.equal(r.data.rewardKind, "BLK");
});

test("parseCreate requires POL amount for POL", () => {
  const r = parseCreateDailyTaskDefinition({
    slug: "daily-pol",
    taskType: "PLAY_GAMES",
    targetValue: 1,
    translationKey: "dailyTasks.tasks.play_games",
    rewardKind: "POL"
  });
  assert.equal(r.ok, false);
});

test("parseCreate accepts HASHRATE_TEMP", () => {
  const r = parseCreateDailyTaskDefinition({
    slug: "daily-hr",
    taskType: "WATCH_YOUTUBE",
    targetValue: 1,
    translationKey: "dailyTasks.tasks.watch_youtube",
    rewardKind: "HASHRATE_TEMP",
    rewardHashRate: 10,
    rewardHashRateDays: 2
  });
  assert.equal(r.ok, true);
  assert.equal(r.data.rewardHashRate, 10);
  assert.equal(r.data.rewardHashRateDays, 2);
});
