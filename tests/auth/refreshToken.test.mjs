import test from "node:test";
import assert from "node:assert/strict";
import { parseRefreshToken } from "#server/utils/authTokens.js";

test("parseRefreshToken accepts tokenId.secret shape", () => {
  const parsed = parseRefreshToken("11111111-2222-4333-8444-555555555555.abcdef0123456789abcdef0123456789abcdef0123456789");
  assert.ok(parsed);
  assert.equal(parsed.tokenId, "11111111-2222-4333-8444-555555555555");
  assert.ok(parsed.tokenHash.length > 10);
});

test("parseRefreshToken rejects malformed tokens", () => {
  assert.equal(parseRefreshToken(""), null);
  assert.equal(parseRefreshToken("only-one-part"), null);
  assert.equal(parseRefreshToken(null), null);
});
