import test from "node:test";
import assert from "node:assert/strict";
import {
  getAuthTwoFactorEnvConfig,
  shouldRequireEmailTwoFactorForLogin,
  parseAuthBoolEnv,
} from "#server/modules/auth/login/login.twoFactor.js";

test("parseAuthBoolEnv: unset uses defaultWhenUnset", () => {
  assert.equal(parseAuthBoolEnv(undefined, false), false);
  assert.equal(parseAuthBoolEnv(undefined, true), true);
});

test("parseAuthBoolEnv: common truthy/falsy strings", () => {
  assert.equal(parseAuthBoolEnv("1", false), true);
  assert.equal(parseAuthBoolEnv("true", false), true);
  assert.equal(parseAuthBoolEnv("0", true), false);
  assert.equal(parseAuthBoolEnv("disabled", true), false);
});

test("shouldRequireEmailTwoFactorForLogin: never when emailTwoFactorEnabled is false", () => {
  assert.equal(
    shouldRequireEmailTwoFactorForLogin({
      user: { id: 1, isTwoFactorEnabled: true, isCreator: true },
      env: {
        emailTwoFactorEnabled: false,
        emailTwoFactorRequiredForAllUsers: true,
        emailTwoFactorRequiredForAdmins: true,
      },
    }),
    false,
  );
});

test("shouldRequireEmailTwoFactorForLogin: per-user when enabled and user opted in", () => {
  assert.equal(
    shouldRequireEmailTwoFactorForLogin({
      user: { id: 1, isTwoFactorEnabled: true },
      env: {
        emailTwoFactorEnabled: true,
        emailTwoFactorRequiredForAllUsers: false,
        emailTwoFactorRequiredForAdmins: false,
      },
    }),
    true,
  );
});

test("shouldRequireEmailTwoFactorForLogin: not for normal user without flags", () => {
  assert.equal(
    shouldRequireEmailTwoFactorForLogin({
      user: { id: 1, isTwoFactorEnabled: false, isCreator: false },
      env: {
        emailTwoFactorEnabled: true,
        emailTwoFactorRequiredForAllUsers: false,
        emailTwoFactorRequiredForAdmins: false,
      },
    }),
    false,
  );
});

test("shouldRequireEmailTwoFactorForLogin: all users when env requires", () => {
  assert.equal(
    shouldRequireEmailTwoFactorForLogin({
      user: { id: 1, isTwoFactorEnabled: false },
      env: {
        emailTwoFactorEnabled: true,
        emailTwoFactorRequiredForAllUsers: true,
        emailTwoFactorRequiredForAdmins: false,
      },
    }),
    true,
  );
});

test("shouldRequireEmailTwoFactorForLogin: creators when admins flag set", () => {
  assert.equal(
    shouldRequireEmailTwoFactorForLogin({
      user: { id: 1, isTwoFactorEnabled: false, isCreator: true },
      env: {
        emailTwoFactorEnabled: true,
        emailTwoFactorRequiredForAllUsers: false,
        emailTwoFactorRequiredForAdmins: true,
      },
    }),
    true,
  );
});

test("getAuthTwoFactorEnvConfig: AUTH_EMAIL_2FA_ENABLED unset defaults master to false", (t) => {
  const prev = process.env.AUTH_EMAIL_2FA_ENABLED;
  delete process.env.AUTH_EMAIL_2FA_ENABLED;
  t.after(() => {
    if (prev === undefined) delete process.env.AUTH_EMAIL_2FA_ENABLED;
    else process.env.AUTH_EMAIL_2FA_ENABLED = prev;
  });
  const cfg = getAuthTwoFactorEnvConfig();
  assert.equal(cfg.emailTwoFactorEnabled, false);
});

test("getAuthTwoFactorEnvConfig: AUTH_EMAIL_2FA_ENABLED=1 enables master", (t) => {
  const prev = process.env.AUTH_EMAIL_2FA_ENABLED;
  process.env.AUTH_EMAIL_2FA_ENABLED = "1";
  t.after(() => {
    if (prev === undefined) delete process.env.AUTH_EMAIL_2FA_ENABLED;
    else process.env.AUTH_EMAIL_2FA_ENABLED = prev;
  });
  const cfg = getAuthTwoFactorEnvConfig();
  assert.equal(cfg.emailTwoFactorEnabled, true);
});
