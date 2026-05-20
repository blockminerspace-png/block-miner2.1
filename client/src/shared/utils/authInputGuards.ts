/**
 * Client-side guards for auth forms. SQL/XSS are enforced server-side (parameterized queries, no raw HTML);
 * here we cap size, strip control characters, and reject obviously invalid shapes before hitting the API.
 */

/** RFC-ish upper bound for email; usernames in this app are capped at 24 on register. */
export const LOGIN_IDENTIFIER_MAX_LEN = 254;
/** bcrypt only uses the first 72 bytes — same cap as register. */
export const LOGIN_PASSWORD_MAX_LEN = 72;
export const LEGACY_RESET_PASSWORD_MIN_LEN = 8;
export const TWO_FACTOR_CODE_LEN = 6;

const CTRL_EXCEPT_TAB = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Removes ASCII control chars (except tab) to reduce odd parsing / log injection. */
export function stripDangerousAsciiControls(value: string): string {
  return String(value ?? '').replace(CTRL_EXCEPT_TAB, '');
}

export function clampLoginIdentifier(raw: string): string {
  return stripDangerousAsciiControls(String(raw ?? '').trim()).slice(0, LOGIN_IDENTIFIER_MAX_LEN);
}

export function clampLoginPassword(raw: string): string {
  const s = String(raw ?? '');
  const noNulls = s.replace(/\u0000/g, '');
  return noNulls.slice(0, LOGIN_PASSWORD_MAX_LEN);
}

export function normalizeTwoFactorInput(raw: string): string {
  return String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, TWO_FACTOR_CODE_LEN);
}

export type LoginFieldErrors = {
  identifier?: 'empty' | 'too_long' | 'invalid_chars' | 'invalid_email';
  password?: 'empty' | 'too_long';
  twoFactor?: 'incomplete' | 'invalid';
};

export function validateLoginIdentifierForSubmit(clamped: string): LoginFieldErrors['identifier'] | null {
  if (!clamped) return 'empty';
  if (clamped.length > LOGIN_IDENTIFIER_MAX_LEN) return 'too_long';
  if (/[\u0000-\u001F\u007F]/.test(clamped)) return 'invalid_chars';
  // Require a valid email address
  if (!clamped.includes('@') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clamped)) return 'invalid_email';
  return null;
}

/** Alias kept for readability at call sites. */
export const validateLoginEmailForSubmit = validateLoginIdentifierForSubmit;

export function validateLoginPasswordForSubmit(clamped: string): LoginFieldErrors['password'] | null {
  if (!clamped) return 'empty';
  if (clamped.length > LOGIN_PASSWORD_MAX_LEN) return 'too_long';
  return null;
}

export function validateTwoFactorForSubmit(code: string): LoginFieldErrors['twoFactor'] | null {
  if (!code) return 'incomplete';
  if (code.length !== TWO_FACTOR_CODE_LEN) return 'incomplete';
  if (!/^\d{6}$/.test(code)) return 'invalid';
  return null;
}

export function validateLegacyNewPassword(password: string): 'empty' | 'too_short' | 'too_long' | null {
  const p = clampLoginPassword(password);
  if (!p) return 'empty';
  if (p.length < LEGACY_RESET_PASSWORD_MIN_LEN) return 'too_short';
  if (p.length > LOGIN_PASSWORD_MAX_LEN) return 'too_long';
  return null;
}

/** Safe snippet for inline UI (no HTML execution — React text nodes still benefit from stripping). */
export function safeInlineMessage(value: string, maxLen = 400): string {
  return stripDangerousAsciiControls(String(value ?? ''))
    .replace(/[<>]/g, '')
    .slice(0, maxLen);
}
