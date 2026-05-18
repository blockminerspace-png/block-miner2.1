import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrismaAwareErrorBody,
  prismaAwareHttpStatus,
} from "#server/utils/prismaHttpErrors.js";

test("checkin status connection failure maps to 503 not opaque 500", () => {
  const err = new Error("timeout exceeded when trying to connect");
  assert.equal(prismaAwareHttpStatus(err), 503);
  const body = buildPrismaAwareErrorBody(err, "Não foi possível carregar o status do check-in agora.");
  assert.equal(body.code, "SERVICE_UNAVAILABLE");
  assert.match(body.message, /check-in/i);
});

test("checkin unauthenticated JSON shape is stable", () => {
  const message = "Sessão expirada ou ausente.";
  const payload = {
    ok: false,
    code: "UNAUTHENTICATED",
    message,
    error: message,
  };
  assert.equal(payload.code, "UNAUTHENTICATED");
  assert.equal(payload.error, payload.message);
});
