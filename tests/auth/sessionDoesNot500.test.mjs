/**
 * Regression: GET /api/auth/session must never return 500 for normal unauthenticated probes.
 * (Reuses session controller directly; HTTP stack covered by authSessionController.test.mjs.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getSession } from "#server/modules/auth/session/session.controller.js";

function createMockResponse() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: undefined,
    headers,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
  };
}

test("GET /api/auth/session without cookie does not return 500", async () => {
  const res = createMockResponse();
  await getSession({ headers: {} }, res);
  assert.notEqual(res.statusCode, 500, "session must not 500 when unauthenticated");
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.ok, false);
  assert.equal(res.body?.code, "UNAUTHENTICATED");
});

test("GET /api/auth/session with garbage cookie does not return 500", async () => {
  const res = createMockResponse();
  await getSession({ headers: { cookie: "blockminer_access=not-a-jwt" } }, res);
  assert.notEqual(res.statusCode, 500);
  assert.equal(res.statusCode, 401);
});
