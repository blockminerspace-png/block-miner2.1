import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { derivePolygonHdAddressAtIndex } from "#server/services/polygonHdWallet.js";

const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("polygonHdWallet", () => {
  it("derives deterministic EVM addresses for BIP-44 m/44'/60'/0'/0/i", () => {
    const a0 = derivePolygonHdAddressAtIndex(TEST_MNEMONIC, 0);
    const a1 = derivePolygonHdAddressAtIndex(TEST_MNEMONIC, 1);
    assert.equal(a0.derivationPath, "m/44'/60'/0'/0/0");
    assert.equal(a1.derivationPath, "m/44'/60'/0'/0/1");
    assert.match(a0.address, /^0x[a-fA-F0-9]{40}$/);
    assert.match(a1.address, /^0x[a-fA-F0-9]{40}$/);
    assert.notEqual(a0.address.toLowerCase(), a1.address.toLowerCase());
    const again = derivePolygonHdAddressAtIndex(TEST_MNEMONIC, 0);
    assert.equal(again.address, a0.address);
  });

  it("rejects invalid index", () => {
    assert.throws(() => derivePolygonHdAddressAtIndex(TEST_MNEMONIC, -1), /Invalid derivation index/);
    assert.throws(() => derivePolygonHdAddressAtIndex(TEST_MNEMONIC, 1.5), /Invalid derivation index/);
  });
});
