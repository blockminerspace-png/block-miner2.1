import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthFailureJson, AUTH_LOGIN_MESSAGES } from "#server/modules/auth/auth.errors.js";

test("buildAuthFailureJson mirrors message into error", () => {
  const j = buildAuthFailureJson("X", "Y");
  assert.equal(j.ok, false);
  assert.equal(j.code, "X");
  assert.equal(j.message, "Y");
  assert.equal(j.error, "Y");
});

test("AUTH_LOGIN_MESSAGES has stable invalid credentials copy", () => {
  assert.match(AUTH_LOGIN_MESSAGES.INVALID_CREDENTIALS, /Credenciais/);
});
