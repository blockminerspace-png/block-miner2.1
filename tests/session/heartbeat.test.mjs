import test from "node:test";
import assert from "node:assert/strict";
import { processHeartbeat } from "#server/controllers/sessionController.js";

function mockRes() {
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
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
  };
}

function validFingerprint(ts = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ ts, b: false, v: "5.1" }), "utf8").toString("base64");
  return { fingerprint: payload, isBot: false, sk: "abc" };
}

test("heartbeat accepts fresh fingerprint and credits youtube balance", async () => {
  const updates = [];
  const req = {
    user: { id: 99, email: "u@test.com", name: "U", isBanned: false },
    body: { type: "youtube", security: validFingerprint() },
    headers: { cookie: "blockminer_access=fake.jwt.token" },
  };
  const res = mockRes();

  const prisma = await import("#server/src/db/prisma.js");
  const originalFind = prisma.default.user.findUnique;
  const originalUpdate = prisma.default.user.update;
  prisma.default.user.findUnique = async () => ({ lastHeartbeatAt: null });
  prisma.default.user.update = async (args) => {
    updates.push(args);
    return {};
  };

  await processHeartbeat(req, res);

  prisma.default.user.findUnique = originalFind;
  prisma.default.user.update = originalUpdate;

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].data.ytSecondsBalance.increment, 10);
});

test("heartbeat rejects stale fingerprint with FINGERPRINT_STALE", async () => {
  const req = {
    user: { id: 1 },
    body: {
      type: "youtube",
      security: validFingerprint(Date.now() - 11 * 60 * 1000),
    },
  };
  const res = mockRes();
  await processHeartbeat(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "FINGERPRINT_STALE");
});

test("heartbeat rejects missing fingerprint with FINGERPRINT_MISSING", async () => {
  const req = {
    user: { id: 1 },
    body: { type: "auto-mining", security: {} },
  };
  const res = mockRes();
  await processHeartbeat(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "FINGERPRINT_MISSING");
});
