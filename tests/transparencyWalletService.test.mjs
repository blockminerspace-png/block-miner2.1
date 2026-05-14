import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertValidTransparencyWalletAddress,
  fetchTrackedWalletsSummary,
  fetchWalletNativeActivity,
} from "#server/services/transparencyWalletService.js";

const originalFetch = global.fetch;

afterEach(() => {
  if (originalFetch === undefined) delete global.fetch;
  else global.fetch = originalFetch;
});

function makeTx({ hash, from, to, valuePol, timeStamp }) {
  return {
    hash,
    from,
    to,
    value: BigInt(valuePol) * 10n ** 18n,
    timeStamp: String(timeStamp),
    txreceipt_status: "1",
    isError: "0",
  };
}

describe("transparencyWalletService", () => {
  it("assertValidTransparencyWalletAddress returns null for empty string", () => {
    assert.equal(assertValidTransparencyWalletAddress(""), null);
    assert.equal(assertValidTransparencyWalletAddress("   "), null);
  });

  it("assertValidTransparencyWalletAddress normalizes to checksum", () => {
    const a = assertValidTransparencyWalletAddress("0x0000000000000000000000000000000000000001");
    assert.equal(typeof a, "string");
    assert.match(a, /^0x[0-9a-fA-F]{40}$/);
  });

  it("assertValidTransparencyWalletAddress rejects garbage", () => {
    assert.throws(() => assertValidTransparencyWalletAddress("0x123"), /Invalid/i);
  });

  it("fetchWalletNativeActivity paginates full history instead of stopping at the first page", async () => {
    const wallet = "0x0000000000000000000000000000000000000001";
    const peerA = "0x0000000000000000000000000000000000000002";
    const peerB = "0x0000000000000000000000000000000000000003";

    global.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname.includes("coingecko.com")) {
        return { ok: true, json: async () => ({ "polygon-ecosystem-token": { usd: 1.5 } }) };
      }

      assert.equal(url.searchParams.get("sort"), "asc");
      assert.equal(url.searchParams.get("offset"), "2");
      assert.equal(url.searchParams.get("address"), wallet);

      const page = Number(url.searchParams.get("page"));
      const pages = {
        1: [
          makeTx({ hash: "0xaaa1", from: peerA, to: wallet, valuePol: 1, timeStamp: 100 }),
          makeTx({ hash: "0xaaa2", from: wallet, to: peerB, valuePol: 2, timeStamp: 200 }),
        ],
        2: [
          makeTx({ hash: "0xaaa3", from: peerB, to: wallet, valuePol: 3, timeStamp: 300 }),
        ],
      };

      return {
        ok: true,
        json: async () => ({
          status: "1",
          message: "OK",
          result: pages[page] || [],
        }),
      };
    };

    const result = await fetchWalletNativeActivity(wallet, { pageSize: 2, maxPages: 5 });

    assert.equal(result.summary.totalInPol, 4);
    assert.equal(result.summary.totalOutPol, 2);
    assert.equal(result.summary.totalInUsd, 6);
    assert.equal(result.summary.totalOutUsd, 3);
    assert.equal(result.summary.movementCount, 3);
    assert.equal(result.history.scannedPages, 2);
    assert.equal(result.history.mayBeTruncated, false);
    assert.deepEqual(result.movements.map((m) => m.hash), ["0xaaa3", "0xaaa2", "0xaaa1"]);
  });

  it("fetchTrackedWalletsSummary aggregates full wallet history and preserves preview slices", async () => {
    const walletA = "0x0000000000000000000000000000000000000001";
    const walletB = "0x0000000000000000000000000000000000000004";
    const peerA = "0x0000000000000000000000000000000000000002";
    const peerB = "0x0000000000000000000000000000000000000003";
    const peerC = "0x0000000000000000000000000000000000000005";

    global.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname.includes("coingecko.com")) {
        return { ok: true, json: async () => ({ "polygon-ecosystem-token": { usd: 1.5 } }) };
      }

      const address = url.searchParams.get("address");
      const page = Number(url.searchParams.get("page"));
      const key = `${address}:${page}`;
      const pages = {
        [`${walletA}:1`]: [
          makeTx({ hash: "0xbbb1", from: peerA, to: walletA, valuePol: 5, timeStamp: 100 }),
          makeTx({ hash: "0xbbb2", from: walletA, to: peerB, valuePol: 1, timeStamp: 200 }),
        ],
        [`${walletA}:2`]: [
          makeTx({ hash: "0xbbb3", from: peerB, to: walletA, valuePol: 2, timeStamp: 300 }),
        ],
        [`${walletB}:1`]: [
          makeTx({ hash: "0xccc1", from: peerC, to: walletB, valuePol: 7, timeStamp: 150 }),
        ],
      };

      return {
        ok: true,
        json: async () => ({
          status: "1",
          message: "OK",
          result: pages[key] || [],
        }),
      };
    };

    const result = await fetchTrackedWalletsSummary(
      [
        { id: 1, label: "Treasury", address: walletA, includeInTotals: true },
        { id: 2, label: "Public", address: walletB, includeInTotals: false },
      ],
      { pageSize: 2, maxPages: 5, previewLimit: 2 }
    );

    assert.equal(result.summary.totalInPol, 7);
    assert.equal(result.summary.totalOutPol, 1);
    assert.equal(result.summary.totalInUsd, 10.5);
    assert.equal(result.summary.totalOutUsd, 1.5);
    assert.equal(result.summary.movementCount, 3);
    assert.equal(result.summary.walletCount, 2);
    assert.equal(result.summary.historyMayBeTruncated, false);
    assert.equal(result.wallets[0].summary.movementCount, 3);
    assert.equal(result.wallets[0].movements.length, 2);
    assert.deepEqual(result.wallets[0].movements.map((m) => m.hash), ["0xbbb3", "0xbbb2"]);
    assert.equal(result.wallets[1].summary.movementCount, 1);
    assert.equal(result.wallets[1].summary.totalInPol, 7);
  });
});
