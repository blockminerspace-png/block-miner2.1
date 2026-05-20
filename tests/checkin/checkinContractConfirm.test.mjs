import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Interface } from "ethers";

describe("checkin.contract server helpers", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("checkIn() selector matches ethers Interface", async () => {
    const iface = new Interface(["function checkIn() payable"]);
    const selector = iface.getFunction("checkIn").selector.toLowerCase();
    const { evaluateCheckinPayment, resolveCheckinContractAddress, getExpectedCheckinChainId } =
      await import("#server/modules/checkin/checkin.contract.js");
    assert.equal(selector, "0x183ff085");
    assert.equal(typeof evaluateCheckinPayment, "function");
    assert.equal(resolveCheckinContractAddress(), "");
    assert.equal(getExpectedCheckinChainId(), 137);
  });

  it("rejects wrong chain id from body parser", async () => {
    const { parseOptionalChainIdFromBody, getExpectedCheckinChainId } =
      await import("#server/modules/checkin/checkin.contract.js");
    process.env.CHECKIN_CHAIN_ID = "137";
    assert.equal(getExpectedCheckinChainId(), 137);
    assert.equal(parseOptionalChainIdFromBody({ chainId: 1 }), 1);
    assert.equal(parseOptionalChainIdFromBody({ chainId: "137" }), 137);
  });

  it("evaluateCheckinPayment uses treasury path when no contract env", async () => {
    process.env.CHECKIN_CONTRACT_ADDRESS = "";
    process.env.POLYGONSCAN_API_KEY = "";
    process.env.AETHER_RPC_URL = "http://127.0.0.1:9";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body || "{}"));
      if (body.method === "eth_getTransactionByHash") {
        return {
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            id: 1,
            result: {
              from: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              value: "0x2386f26fc10000",
              input: "0x"
            }
          })
        };
      }
      if (body.method === "eth_getTransactionReceipt") {
        return {
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            id: 1,
            result: { status: "0x1" }
          })
        };
      }
      return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: null }) };
    };

    const { evaluateCheckinPayment } = await import("#server/modules/checkin/checkin.contract.js");
    const txHash = "0x" + "ef".repeat(32);
    const ev = await evaluateCheckinPayment({
      txHash,
      userWalletLower: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      receiverLower: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      minValueWei: 10_000_000_000_000_000n
    });
    assert.equal(ev.state, "confirmed");

    globalThis.fetch = originalFetch;
  });
});
