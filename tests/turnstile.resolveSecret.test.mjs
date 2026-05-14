import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

describe("resolveTurnstileSecret", () => {
  const snapshot = { ...process.env };

  beforeEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_SECRET_KEY_LOGIN;
    delete process.env.TURNSTILE_SECRET_KEY_REGISTER;
    delete process.env.TURNSTILE_USE_CLOUDFLARE_DUMMY_KEYS;
  });

  afterEach(() => {
    for (const k of [
      "TURNSTILE_SECRET_KEY",
      "TURNSTILE_SECRET_KEY_LOGIN",
      "TURNSTILE_SECRET_KEY_REGISTER",
      "TURNSTILE_USE_CLOUDFLARE_DUMMY_KEYS",
    ]) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  });

  it("uses only TURNSTILE_SECRET_KEY when purpose is omitted", async () => {
    process.env.TURNSTILE_SECRET_KEY = "shared";
    const { resolveTurnstileSecret } = await import("#server/middleware/turnstile.js");
    assert.equal(resolveTurnstileSecret(undefined), "shared");
  });

  it("login prefers TURNSTILE_SECRET_KEY_LOGIN then falls back", async () => {
    process.env.TURNSTILE_SECRET_KEY = "fallback";
    process.env.TURNSTILE_SECRET_KEY_LOGIN = "login-secret";
    const { resolveTurnstileSecret } = await import("#server/middleware/turnstile.js");
    assert.equal(resolveTurnstileSecret("login"), "login-secret");
    delete process.env.TURNSTILE_SECRET_KEY_LOGIN;
    assert.equal(resolveTurnstileSecret("login"), "fallback");
  });

  it("register prefers TURNSTILE_SECRET_KEY_REGISTER then falls back", async () => {
    process.env.TURNSTILE_SECRET_KEY_REGISTER = "reg-only";
    const { resolveTurnstileSecret } = await import("#server/middleware/turnstile.js");
    assert.equal(resolveTurnstileSecret("register"), "reg-only");
  });

  it("dummy keys mode returns Cloudflare test secret for all purposes", async () => {
    process.env.TURNSTILE_USE_CLOUDFLARE_DUMMY_KEYS = "1";
    process.env.TURNSTILE_SECRET_KEY = "real-should-be-ignored";
    process.env.TURNSTILE_SECRET_KEY_LOGIN = "login-ignored";
    const { resolveTurnstileSecret } = await import("#server/middleware/turnstile.js");
    assert.equal(resolveTurnstileSecret("login"), "1x0000000000000000000000000000000AA");
    assert.equal(resolveTurnstileSecret("register"), "1x0000000000000000000000000000000AA");
    assert.equal(resolveTurnstileSecret(undefined), "1x0000000000000000000000000000000AA");
  });
});

describe("getTurnstileBootFatalError", () => {
  const snapshot = { ...process.env };

  afterEach(() => {
    for (const k of [
      "NODE_ENV",
      "TURNSTILE_USE_CLOUDFLARE_DUMMY_KEYS",
      "ALLOW_TURNSTILE_DUMMY_IN_PRODUCTION",
    ]) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  });

  it("empty when not production", async () => {
    process.env.NODE_ENV = "test";
    process.env.TURNSTILE_USE_CLOUDFLARE_DUMMY_KEYS = "1";
    const { getTurnstileBootFatalError } = await import("#server/middleware/turnstile.js");
    assert.equal(getTurnstileBootFatalError(), "");
  });

  it("empty in production when dummy flag is off", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.TURNSTILE_USE_CLOUDFLARE_DUMMY_KEYS;
    const { getTurnstileBootFatalError } = await import("#server/middleware/turnstile.js");
    assert.equal(getTurnstileBootFatalError(), "");
  });

  it("non-empty in production when dummy keys on without allow", async () => {
    process.env.NODE_ENV = "production";
    process.env.TURNSTILE_USE_CLOUDFLARE_DUMMY_KEYS = "1";
    delete process.env.ALLOW_TURNSTILE_DUMMY_IN_PRODUCTION;
    const { getTurnstileBootFatalError } = await import("#server/middleware/turnstile.js");
    assert.ok(getTurnstileBootFatalError().includes("Refusing to start"));
  });

  it("empty in production when dummy on but allow escape is set", async () => {
    process.env.NODE_ENV = "production";
    process.env.TURNSTILE_USE_CLOUDFLARE_DUMMY_KEYS = "1";
    process.env.ALLOW_TURNSTILE_DUMMY_IN_PRODUCTION = "1";
    const { getTurnstileBootFatalError } = await import("#server/middleware/turnstile.js");
    assert.equal(getTurnstileBootFatalError(), "");
  });
});
