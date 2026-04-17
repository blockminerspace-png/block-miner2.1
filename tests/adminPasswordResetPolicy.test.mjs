import test from "node:test";
import assert from "node:assert/strict";
import { isAdminKeyedPasswordResetApiEnabled } from "../server/utils/adminPasswordResetPolicy.js";

test("non-production always allows admin-keyed reset API", () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  delete process.env.ALLOW_ADMIN_PASSWORD_RESET_API;
  assert.equal(isAdminKeyedPasswordResetApiEnabled(), true);
  process.env.NODE_ENV = prev;
});

test("production disables admin-keyed reset API unless env flag", () => {
  const prevNode = process.env.NODE_ENV;
  const prevFlag = process.env.ALLOW_ADMIN_PASSWORD_RESET_API;
  process.env.NODE_ENV = "production";

  delete process.env.ALLOW_ADMIN_PASSWORD_RESET_API;
  assert.equal(isAdminKeyedPasswordResetApiEnabled(), false);

  process.env.ALLOW_ADMIN_PASSWORD_RESET_API = "0";
  assert.equal(isAdminKeyedPasswordResetApiEnabled(), false);

  process.env.ALLOW_ADMIN_PASSWORD_RESET_API = "1";
  assert.equal(isAdminKeyedPasswordResetApiEnabled(), true);

  process.env.ALLOW_ADMIN_PASSWORD_RESET_API = "true";
  assert.equal(isAdminKeyedPasswordResetApiEnabled(), true);

  process.env.NODE_ENV = prevNode;
  if (prevFlag === undefined) delete process.env.ALLOW_ADMIN_PASSWORD_RESET_API;
  else process.env.ALLOW_ADMIN_PASSWORD_RESET_API = prevFlag;
});
