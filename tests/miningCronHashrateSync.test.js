import test from "node:test";
import assert from "node:assert/strict";

import { refreshKnownMinerHashrates } from "#server/cron/miningCron.js";

test("refreshKnownMinerHashrates updates stale in-memory POL hashrate", async () => {
  const miner = { userId: 1, baseHashRate: 60 };
  const engine = { miners: new Map([["miner-1", miner]]) };

  const result = await refreshKnownMinerHashrates({
    engine,
    syncUserBaseHashRate: async (userId) => {
      assert.equal(userId, 1);
      return 10;
    }
  });

  assert.deepEqual(result, { refreshed: 1, changed: 1 });
  assert.equal(miner.baseHashRate, 10);
});

test("refreshKnownMinerHashrates syncs each user once", async () => {
  const minerA = { userId: 1, baseHashRate: 60 };
  const minerB = { userId: 1, baseHashRate: 60 };
  const engine = {
    miners: new Map([
      ["miner-a", minerA],
      ["miner-b", minerB]
    ])
  };
  let calls = 0;

  const result = await refreshKnownMinerHashrates({
    engine,
    syncUserBaseHashRate: async () => {
      calls += 1;
      return 10;
    }
  });

  assert.equal(calls, 1);
  assert.deepEqual(result, { refreshed: 1, changed: 1 });
  assert.equal(minerA.baseHashRate, 10);
  assert.equal(minerB.baseHashRate, 60);
});
