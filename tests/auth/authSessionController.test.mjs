import test from "node:test";
import assert from "node:assert/strict";
import { authRouter } from "#server/modules/auth/index.js";
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

test("auth module exports named router", () => {
  assert.ok(authRouter);
});

test("GET /api/auth/session without cookie returns safe unauthenticated JSON, not 500", async () => {
  const req = { headers: {} };
  const res = createMockResponse();

  await getSession(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, {
    ok: false,
    code: "UNAUTHENTICATED",
    message: "Sessão expirada ou ausente.",
    error: "Sessão expirada ou ausente.",
  });
});

test("GET /api/auth/session with invalid session cookie returns safe unauthenticated JSON, not 500", async () => {
  const req = { headers: { cookie: "blockminer_access=not-a-jwt" } };
  const res = createMockResponse();

  await getSession(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.code, "UNAUTHENTICATED");
});
