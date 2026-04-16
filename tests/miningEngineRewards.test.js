import test from "node:test";
import assert from "node:assert/strict";
import { MiningEngine } from "../server/src/miningEngine.js";

test("MiningEngine.distributeRewards distributes proportionally", () => {
  const engine = new MiningEngine();
  const minerA = engine.createOrGetMiner({ userId: 101, username: "alpha", profile: { rigs: 1, baseHashRate: 10 } });
  const minerB = engine.createOrGetMiner({ userId: 202, username: "beta", profile: { rigs: 1, baseHashRate: 20 } });

  engine.roundWork.set(minerA.id, 100);
  engine.roundWork.set(minerB.id, 300);
  engine.activeMiners = 2;

  engine.distributeRewards();

  // rewardBase is 0.30 POL; shares follow roundWork (100 : 300)
  assert.ok(Math.abs(minerA.balance - 0.075) < 1e-12);
  assert.ok(Math.abs(minerB.balance - 0.225) < 1e-12);
  assert.equal(engine.blockNumber, 2);
  assert.equal(engine.lastReward, 0.3);
});

test("MiningEngine.distributeRewards handles zero-work round", () => {
  const engine = new MiningEngine();
  const miner = engine.createOrGetMiner({ userId: 303, username: "idle", profile: { rigs: 1, baseHashRate: 0 } });

  engine.roundWork.set(miner.id, 0);
  engine.activeMiners = 0;

  engine.distributeRewards();

  assert.equal(miner.balance, 0);
  assert.equal(engine.lastReward, 0);
  assert.equal(engine.blockNumber, 2);
});

test("MiningEngine.distributeRewards rollback restores lastPersistedBalance when persist fails", async () => {
  const engine = new MiningEngine();
  const miner = engine.createOrGetMiner({
    userId: 404,
    username: "persist_fail",
    profile: { rigs: 1, base_hash_rate: 10, balance: 5 }
  });
  miner.balance = 5;
  miner.lastPersistedBalance = 5;

  engine.roundWork.set(miner.id, 100);
  engine.activeMiners = 1;
  engine.setPersistBlockRewardsCallback(() => Promise.reject(new Error("simulated DB failure")));

  engine.distributeRewards();

  await new Promise((r) => setImmediate(r));

  assert.equal(miner.balance, 5, "balance must revert so persistMinerProfile does not apply a bogus negative delta");
  assert.equal(miner.lastPersistedBalance, 5, "lastPersistedBalance must revert with balance or POL would be decremented wrongly");
});
