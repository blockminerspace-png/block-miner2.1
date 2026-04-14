import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

describe("evaluateCheckinTx missingTxBehavior", () => {
  const originalFetch = globalThis.fetch;
  const envBackup = {
    POLYGONSCAN_API_KEY: process.env.POLYGONSCAN_API_KEY,
    AETHER_RPC_URL: process.env.AETHER_RPC_URL,
    POLYGON_RPC_URL: process.env.POLYGON_RPC_URL
  };

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const k of Object.keys(envBackup)) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k];
    }
  });

  it("fails closed when missingTxBehavior is failed and RPC returns no tx", async () => {
    process.env.POLYGONSCAN_API_KEY = "";
    process.env.AETHER_RPC_URL = "http://127.0.0.1:9";
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body || "{}"));
      if (body.method === "eth_getTransactionByHash") {
        return {
          ok: true,
          json: async () => ({ jsonrpc: "2.0", id: 1, result: null })
        };
      }
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: null }) };
    };

    const { evaluateCheckinTx } = await import("../server/services/checkinChain.js");
    const txHash = "0x" + "ab".repeat(32);
    const ev = await evaluateCheckinTx({
      txHash,
      userWalletLower: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      receiverLower: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      minValueWei: 10_000_000_000_000_000n,
      missingTxBehavior: "failed"
    });
    assert.equal(ev.state, "failed");
    assert.equal(ev.ok, false);
  });

  it("stays pending when tx is missing and missingTxBehavior defaults to pending", async () => {
    process.env.POLYGONSCAN_API_KEY = "";
    process.env.AETHER_RPC_URL = "http://127.0.0.1:9";
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body || "{}"));
      if (body.method === "eth_getTransactionByHash") {
        return {
          ok: true,
          json: async () => ({ jsonrpc: "2.0", id: 1, result: null })
        };
      }
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: null }) };
    };

    const { evaluateCheckinTx } = await import("../server/services/checkinChain.js");
    const txHash = "0x" + "cd".repeat(32);
    const ev = await evaluateCheckinTx({
      txHash,
      userWalletLower: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      receiverLower: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      minValueWei: 10_000_000_000_000_000n
    });
    assert.equal(ev.state, "pending");
    assert.equal(ev.ok, true);
  });
});
