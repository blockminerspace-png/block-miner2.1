/**
 * Email 2FA on login is optional: explicit env flags + per-user `isTwoFactorEnabled`.
 * Absent env values default to false (no implicit "require for everyone" or master enable).
 * Set `AUTH_EMAIL_2FA_ENABLED=true` to allow the email challenge pipeline at all.
 */

export type AuthTwoFactorEnvConfig = {
  /** When false, email 2FA challenge is never issued (even if user opted in). */
  emailTwoFactorEnabled: boolean;
  emailTwoFactorRequiredForAllUsers: boolean;
  /** Uses `isCreator` on User as elevated account signal (no separate admin role on player User row). */
  emailTwoFactorRequiredForAdmins: boolean;
};

const TRUTHY = new Set(["1", "true", "yes", "enabled", "on"]);
const FALSY = new Set(["0", "false", "no", "disabled", "off"]);

/**
 * @param defaultWhenUnset used when env is undefined/null/empty string only.
 */
export function parseAuthBoolEnv(value: string | undefined, defaultWhenUnset: boolean): boolean {
  if (value === undefined || value === null) return defaultWhenUnset;
  const s = String(value).trim();
  if (s === "") return defaultWhenUnset;
  const lower = s.toLowerCase();
  if (TRUTHY.has(lower)) return true;
  if (FALSY.has(lower)) return false;
  return defaultWhenUnset;
}

export function getAuthTwoFactorEnvConfig(): AuthTwoFactorEnvConfig {
  return {
    emailTwoFactorEnabled: parseAuthBoolEnv(process.env.AUTH_EMAIL_2FA_ENABLED, false),
    emailTwoFactorRequiredForAllUsers: parseAuthBoolEnv(process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ALL_USERS, false),
    emailTwoFactorRequiredForAdmins: parseAuthBoolEnv(process.env.AUTH_EMAIL_2FA_REQUIRED_FOR_ADMINS, false),
  };
}

export type LoginTwoFactorUserShape = {
  id: number;
  isTwoFactorEnabled?: boolean | null;
  emailTwoFactorEnabled?: boolean | null;
  isCreator?: boolean | null;
};

export function shouldRequireEmailTwoFactorForLogin(input: {
  user: LoginTwoFactorUserShape;
  env: AuthTwoFactorEnvConfig;
}): boolean {
  const { user, env } = input;
  if (!env.emailTwoFactorEnabled) {
    return false;
  }
  if (env.emailTwoFactorRequiredForAllUsers) {
    return true;
  }
  if (env.emailTwoFactorRequiredForAdmins && Boolean(user.isCreator)) {
    return true;
  }
  return Boolean(user.isTwoFactorEnabled) || Boolean(user.emailTwoFactorEnabled);
}
