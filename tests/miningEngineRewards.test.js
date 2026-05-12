import test from "node:test";
import assert from "node:assert/strict";
import { MiningEngine } from "../server/src/miningEngine.js";

test("MiningEngine.distributeRewards distributes proportionally", async () => {
  const engine = new MiningEngine();
  const minerA = engine.createOrGetMiner({ userId: 101, username: "alpha", profile: { rigs: 1, baseHashRate: 10 } });
  const minerB = engine.createOrGetMiner({ userId: 202, username: "beta", profile: { rigs: 1, baseHashRate: 20 } });

  engine.roundWork.set(minerA.id, 100);
  engine.roundWork.set(minerB.id, 300);
  engine.activeMiners = 2;

  await engine.distributeRewardsAsync();

  // rewardBase is 0.30 POL; shares follow roundWork (100 : 300)
  assert.ok(Math.abs(minerA.balance - 0.075) < 1e-12);
  assert.ok(Math.abs(minerB.balance - 0.225) < 1e-12);
  assert.equal(engine.blockNumber, 2);
  assert.equal(engine.lastReward, 0.3);
});

test("MiningEngine.distributeRewards handles zero-work round", async () => {
  const engine = new MiningEngine();
  const miner = engine.createOrGetMiner({ userId: 303, username: "idle", profile: { rigs: 1, baseHashRate: 0 } });

  engine.roundWork.set(miner.id, 0);
  engine.activeMiners = 0;

  await engine.distributeRewardsAsync();

  assert.equal(miner.balance, 0);
  assert.equal(engine.lastReward, 0);
  assert.equal(engine.blockNumber, 2);
});

test("MiningEngine.distributeRewards rollback restores lastPersistedBalance when persist fails", async () => {
  const prevMax = process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS;
  process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS = "1";
  try {
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

  await engine.distributeRewardsAsync();

  assert.equal(miner.balance, 5, "balance must revert so persistMinerProfile does not apply a bogus negative delta");
  assert.equal(miner.lastPersistedBalance, 5, "lastPersistedBalance must revert with balance or POL would be decremented wrongly");
  assert.equal(engine.blockNumber, 2, "block schedule must advance so mining ticks do not freeze at countdown 0");
  assert.ok(engine.nextBlockAt > Date.now(), "nextBlockAt must move into the future after a failed persist");
  } finally {
    if (prevMax !== undefined) process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS = prevMax;
    else delete process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS;
  }
});

test("MiningEngine retries persist on transient failure", async () => {
  const prevMax = process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS;
  const prevBase = process.env.MINING_BLOCK_PERSIST_RETRY_BASE_MS;
  process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS = "4";
  process.env.MINING_BLOCK_PERSIST_RETRY_BASE_MS = "1";
  try {
    const engine = new MiningEngine();
    const miner = engine.createOrGetMiner({
      userId: 606,
      username: "retry_ok",
      profile: { rigs: 1, base_hash_rate: 10, balance: 1 }
    });
    miner.balance = 1;
    miner.lastPersistedBalance = 1;
    engine.roundWork.set(miner.id, 100);
    engine.activeMiners = 1;
    let calls = 0;
    engine.setPersistBlockRewardsCallback(async () => {
      calls += 1;
      if (calls < 2) throw new Error("transient");
    });
    await engine.distributeRewardsAsync();
    assert.equal(calls, 2);
    assert.ok(miner.balance > 1);
    assert.equal(engine.blockNumber, 2);
  } finally {
    if (prevMax !== undefined) process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS = prevMax;
    else delete process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS;
    if (prevBase !== undefined) process.env.MINING_BLOCK_PERSIST_RETRY_BASE_MS = prevBase;
    else delete process.env.MINING_BLOCK_PERSIST_RETRY_BASE_MS;
  }
});

test("MiningEngine.getPublicState omits leaderboard by default and only includes it on demand", () => {
  const engine = new MiningEngine();
  const miner = engine.createOrGetMiner({
    userId: 505,
    username: "leader",
    profile: { rigs: 1, base_hash_rate: 25, balance: 1.5 }
  });

  const defaultState = engine.getPublicState(miner.id);
  assert.equal(Object.prototype.hasOwnProperty.call(defaultState, "leaderboard"), false);

  const withLeaderboard = engine.getPublicState(miner.id, { includeLeaderboard: true });
  assert.equal(Array.isArray(withLeaderboard.leaderboard), true);
  assert.equal(withLeaderboard.leaderboard[0]?.username, "leader");
});
