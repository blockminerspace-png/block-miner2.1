import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import {
  evaluateExplicitSocketHandshakeToken,
  attachSocketIoExplicitAuthMiddleware,
} from "../server/utils/socketHandshakeAuthPolicy.js";

function makeVerifier(secret) {
  return (token) => {
    try {
      return jwt.verify(token, secret, { algorithms: ["HS256"] });
    } catch {
      return null;
    }
  };
}

test("evaluateExplicitSocketHandshakeToken skips empty / non-string", () => {
  const v = makeVerifier("s");
  assert.deepEqual(evaluateExplicitSocketHandshakeToken(undefined, v), { kind: "skip" });
  assert.deepEqual(evaluateExplicitSocketHandshakeToken(null, v), { kind: "skip" });
  assert.deepEqual(evaluateExplicitSocketHandshakeToken("", v), { kind: "skip" });
  assert.deepEqual(evaluateExplicitSocketHandshakeToken("   ", v), { kind: "skip" });
  assert.deepEqual(evaluateExplicitSocketHandshakeToken(1, v), { kind: "skip" });
});

test("evaluateExplicitSocketHandshakeToken rejects malformed JWT shape", () => {
  const v = makeVerifier("secret");
  assert.deepEqual(evaluateExplicitSocketHandshakeToken("a.b", v), { kind: "reject", message: "Unauthorized" });
  assert.deepEqual(evaluateExplicitSocketHandshakeToken("not-a-jwt", v), { kind: "reject", message: "Unauthorized" });
});

test("evaluateExplicitSocketHandshakeToken rejects invalid signature", () => {
  const v = makeVerifier("secret");
  const bad = jwt.sign({ sub: "9" }, "other", { algorithm: "HS256" });
  assert.deepEqual(evaluateExplicitSocketHandshakeToken(bad, v), { kind: "reject", message: "Unauthorized" });
});

test("evaluateExplicitSocketHandshakeToken accepts valid token", () => {
  const v = makeVerifier("secret");
  const token = jwt.sign({ sub: "42" }, "secret", { algorithm: "HS256" });
  const r = evaluateExplicitSocketHandshakeToken(token, v);
  assert.equal(r.kind, "ok");
  assert.equal(r.userId, 42);
});

test("evaluateExplicitSocketHandshakeToken rejects token without numeric sub", () => {
  const v = makeVerifier("secret");
  const token = jwt.sign({ sub: "x" }, "secret", { algorithm: "HS256" });
  assert.deepEqual(evaluateExplicitSocketHandshakeToken(token, v), { kind: "reject", message: "Unauthorized" });
});

test("attachSocketIoExplicitAuthMiddleware wires io.use and accepts valid token", async () => {
  const verify = makeVerifier("s2");
  const token = jwt.sign({ sub: "7" }, "s2", { algorithm: "HS256" });
  const used = [];
  const mockIo = {
    use(fn) {
      used.push(fn);
    },
  };
  attachSocketIoExplicitAuthMiddleware(mockIo, { verifyAccessToken: verify });
  assert.equal(used.length, 1);
  const nextCalls = [];
  const socket = {
    handshake: { auth: { token } },
    data: {},
  };
  await new Promise((resolve) => {
    used[0](socket, (err) => {
      nextCalls.push(err ?? null);
      resolve();
    });
  });
  assert.equal(nextCalls[0], null);
  assert.equal(socket.data.handshakeAuthUserId, 7);
});

test("attachSocketIoExplicitAuthMiddleware rejects invalid explicit token", async () => {
  const verify = makeVerifier("s3");
  const used = [];
  attachSocketIoExplicitAuthMiddleware({ use: (fn) => used.push(fn) }, { verifyAccessToken: verify });
  const socket = { handshake: { auth: { token: "a.b.c" } }, data: {} };
  await new Promise((resolve) => {
    used[0](socket, (err) => {
      assert.ok(err instanceof Error);
      resolve();
    });
  });
});
