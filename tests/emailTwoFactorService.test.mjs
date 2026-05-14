import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { issueEmailTwoFactorChallenge, verifyEmailTwoFactorChallenge } from "#server/services/emailTwoFactorService.js";

describe("emailTwoFactorService", () => {
  const snapshot = { ...process.env };

  beforeEach(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "testsecret-2fa-email";
    process.env.JWT_ISSUER = process.env.JWT_ISSUER || "blockminer";
    process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE || "blockminer.app";
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in snapshot)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(snapshot)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("returns smtp unavailable when SMTP is not configured", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
    const result = await issueEmailTwoFactorChallenge({
      userId: 1,
      email: "user@example.com",
      name: "User",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "SMTP_UNAVAILABLE");
  });

  it("accepts valid challenge token and code", () => {
    const code = "123456";
    const challengeId = "cid-test";
    const codeHash = crypto.createHash("sha256").update(`${challengeId}:${code}`).digest("hex");
    const token = jwt.sign(
      { sub: "10", typ: "email-2fa", cid: challengeId, cch: codeHash },
      process.env.JWT_SECRET,
      {
        expiresIn: "10m",
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
      },
    );
    const result = verifyEmailTwoFactorChallenge({
      challengeToken: token,
      code,
      userId: 10,
    });
    assert.equal(result.ok, true);
  });

  it("rejects invalid code for valid challenge token", () => {
    const code = "123456";
    const challengeId = "cid-test";
    const codeHash = crypto.createHash("sha256").update(`${challengeId}:${code}`).digest("hex");
    const token = jwt.sign(
      { sub: "10", typ: "email-2fa", cid: challengeId, cch: codeHash },
      process.env.JWT_SECRET,
      {
        expiresIn: "10m",
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
      },
    );
    const result = verifyEmailTwoFactorChallenge({
      challengeToken: token,
      code: "654321",
      userId: 10,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "INVALID_CODE");
  });
});
