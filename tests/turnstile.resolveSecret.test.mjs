import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

describe("resolveTurnstileSecret", () => {
  const snapshot = { ...process.env };

  beforeEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_SECRET_KEY_LOGIN;
    delete process.env.TURNSTILE_SECRET_KEY_REGISTER;
  });

  afterEach(() => {
    for (const k of ["TURNSTILE_SECRET_KEY", "TURNSTILE_SECRET_KEY_LOGIN", "TURNSTILE_SECRET_KEY_REGISTER"]) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  });

  it("uses only TURNSTILE_SECRET_KEY when purpose is omitted", async () => {
    process.env.TURNSTILE_SECRET_KEY = "shared";
    const { resolveTurnstileSecret } = await import("../server/middleware/turnstile.js");
    assert.equal(resolveTurnstileSecret(undefined), "shared");
  });

  it("login prefers TURNSTILE_SECRET_KEY_LOGIN then falls back", async () => {
    process.env.TURNSTILE_SECRET_KEY = "fallback";
    process.env.TURNSTILE_SECRET_KEY_LOGIN = "login-secret";
    const { resolveTurnstileSecret } = await import("../server/middleware/turnstile.js");
    assert.equal(resolveTurnstileSecret("login"), "login-secret");
    delete process.env.TURNSTILE_SECRET_KEY_LOGIN;
    assert.equal(resolveTurnstileSecret("login"), "fallback");
  });

  it("register prefers TURNSTILE_SECRET_KEY_REGISTER then falls back", async () => {
    process.env.TURNSTILE_SECRET_KEY_REGISTER = "reg-only";
    const { resolveTurnstileSecret } = await import("../server/middleware/turnstile.js");
    assert.equal(resolveTurnstileSecret("register"), "reg-only");
  });
});
