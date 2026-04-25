import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  registerBodySchema,
  REGISTER_EMAIL_MAX_LEN,
  REGISTER_PASSWORD_MAX_LEN,
  REGISTER_REF_CODE_MAX_LEN,
} from "../server/validation/registerBodySchema.js";

const base = {
  username: "valid_user",
  email: "a@b.co",
  password: "12345678",
  acceptTerms: true,
};

describe("registerBodySchema", () => {
  it("accepts minimal valid payload without refCode", () => {
    const r = registerBodySchema.safeParse({ ...base, refCode: "" });
    assert.equal(r.success, true);
    assert.equal(r.data.refCode, undefined);
  });

  it("accepts payload when refCode is omitted", () => {
    const { refCode: _drop, ...noRef } = base;
    const r = registerBodySchema.safeParse(noRef);
    assert.equal(r.success, true);
    assert.equal(r.data.refCode, undefined);
  });

  it("rejects email longer than REGISTER_EMAIL_MAX_LEN", () => {
    const suffix = "@z.co";
    const local = "a".repeat(REGISTER_EMAIL_MAX_LEN - suffix.length + 1);
    const r = registerBodySchema.safeParse({ ...base, email: `${local}${suffix}` });
    assert.equal(r.success, false);
    assert.ok(r.error.issues.some((i) => i.message === "auth.register.errors.email_too_long"));
  });

  it("rejects password longer than REGISTER_PASSWORD_MAX_LEN", () => {
    const r = registerBodySchema.safeParse({ ...base, password: "x".repeat(REGISTER_PASSWORD_MAX_LEN + 1) });
    assert.equal(r.success, false);
    assert.ok(r.error.issues.some((i) => i.message === "auth.register.errors.password_max"));
  });

  it("rejects refCode longer than REGISTER_REF_CODE_MAX_LEN", () => {
    const r = registerBodySchema.safeParse({ ...base, refCode: "1".repeat(REGISTER_REF_CODE_MAX_LEN + 1) });
    assert.equal(r.success, false);
    assert.ok(r.error.issues.some((i) => i.message === "auth.register.errors.ref_code_too_long"));
  });

  it("rejects refCode with invalid characters", () => {
    const r = registerBodySchema.safeParse({ ...base, refCode: "abc<script>" });
    assert.equal(r.success, false);
    assert.ok(r.error.issues.some((i) => i.message === "auth.register.errors.ref_code_invalid"));
  });
});
