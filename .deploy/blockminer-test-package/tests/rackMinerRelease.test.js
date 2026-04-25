import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { releaseUserMinerFromRacksTx } from "../server/utils/rackMinerRelease.js";

describe("releaseUserMinerFromRacksTx", () => {
  it("clears primary and blocked racks by userMiner id only", async () => {
    const calls = [];
    const updateMany = async (args) => {
      calls.push(args);
      return { count: 1 };
    };
    const tx = { userRack: { updateMany } };

    await releaseUserMinerFromRacksTx(tx, 1, 42);

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], {
      where: { userMinerId: 42 },
      data: { userMinerId: null, installedAt: null },
    });
    assert.deepEqual(calls[1], {
      where: { blockedByMinerId: 42 },
      data: { blockedByMinerId: null },
    });
  });
});
