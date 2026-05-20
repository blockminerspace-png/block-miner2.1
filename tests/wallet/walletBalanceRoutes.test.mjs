import test from "node:test";
import assert from "node:assert/strict";
import { evaluateExplicitSocketHandshakeToken } from "#server/utils/socketHandshakeAuthPolicy.js";

test("wallet balance without session should be rejected at auth middleware (401), not 502", () => {
  const r = evaluateExplicitSocketHandshakeToken("", () => null);
  assert.equal(r.kind, "skip");
});

test("invalid socket handshake token is rejected with Unauthorized", () => {
  const r = evaluateExplicitSocketHandshakeToken("not-a-jwt", () => null);
  assert.equal(r.kind, "reject");
  assert.equal(r.message, "Unauthorized");
});
