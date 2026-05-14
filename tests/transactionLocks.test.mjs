import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  lockUserInventoryRowForUpdate,
  lockUserMinerRowForUpdate,
  lockUserRowForUpdate,
  lockUserVaultRowForUpdate
} from "#server/utils/transactionLocks.js";

function createTxMock(returnRows) {
  const calls = [];
  return {
    tx: {
      async $queryRaw(parts, ...vals) {
        calls.push({ sql: String(parts?.[0] || ""), vals });
        return typeof returnRows === "function" ? returnRows(calls.length) : returnRows;
      }
    },
    calls
  };
}

describe("transactionLocks", () => {
  it("locks user row for update", async () => {
    const { tx, calls } = createTxMock([]);
    await lockUserRowForUpdate(tx, 7);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].vals[0], 7);
  });

  it("returns true when inventory lock finds a row", async () => {
    const { tx, calls } = createTxMock([{ id: 10 }]);
    const ok = await lockUserInventoryRowForUpdate(tx, 7, 10);
    assert.equal(ok, true);
    assert.deepEqual(calls[0].vals, [10, 7]);
  });

  it("returns false when vault lock does not find a row", async () => {
    const { tx, calls } = createTxMock([]);
    const ok = await lockUserVaultRowForUpdate(tx, 8, 99);
    assert.equal(ok, false);
    assert.deepEqual(calls[0].vals, [99, 8]);
  });

  it("returns false when miner lock query result is not an array", async () => {
    const { tx } = createTxMock(null);
    const ok = await lockUserMinerRowForUpdate(tx, 9, 42);
    assert.equal(ok, false);
  });
});
