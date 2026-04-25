import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertValidTransparencyWalletAddress } from "../server/services/transparencyWalletService.js";

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
});
