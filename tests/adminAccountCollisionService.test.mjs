import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeEvmAddress } from "../server/services/adminAccountCollisionService.js";

describe("adminAccountCollisionService", () => {
  it("normalizeEvmAddress accepts checksummed hex and lowercases", () => {
    assert.equal(
      normalizeEvmAddress("0xAbCdEf0123456789aBcDeF0123456789aBcDeF01"),
      "0xabcdef0123456789abcdef0123456789abcdef01"
    );
  });

  it("normalizeEvmAddress rejects invalid input", () => {
    assert.equal(normalizeEvmAddress(""), null);
    assert.equal(normalizeEvmAddress("not-an-address"), null);
    assert.equal(normalizeEvmAddress("0x123"), null);
    assert.equal(normalizeEvmAddress(null), null);
  });
});
