import {
  stripDangerousAsciiControls,
  clampLoginPassword,
  safeInlineMessage,
} from './authInputGuards';
import {
  REGISTER_USERNAME_MAX,
  REGISTER_EMAIL_MAX_LEN,
  REGISTER_PASSWORD_MAX_LEN,
  REGISTER_REF_CODE_MAX_LEN,
} from '../constants/registerFieldLimits';

const USERNAME_ALLOWED = /^[a-zA-Z0-9._-]+$/;
/** Loose shape; server Zod `.email()` is authoritative. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function clipRefCodeFromQuery(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, REGISTER_REF_CODE_MAX_LEN);
}

export function sanitizeRegisterUsername(raw: string): string {
  return stripDangerousAsciiControls(String(raw ?? '').trim()).slice(0, REGISTER_USERNAME_MAX);
}

export function sanitizeRegisterEmail(raw: string): string {
  return stripDangerousAsciiControls(String(raw ?? '').trim())
    .toLowerCase()
    .slice(0, REGISTER_EMAIL_MAX_LEN);
}

export function sanitizeRegisterRefCode(raw: string): string {
  return stripDangerousAsciiControls(String(raw ?? ''))
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, REGISTER_REF_CODE_MAX_LEN);
}

export function sanitizeRegisterPassword(raw: string): string {
  return clampLoginPassword(raw);
}

export type RegisterFieldId =
  | 'username'
  | 'email'
  | 'password'
  | 'confirmPassword'
  | 'refCode'
  | 'acceptTerms';

export function validateUsernameShape(u: string): boolean {
  return USERNAME_ALLOWED.test(u);
}

export function validateEmailShape(em: string): boolean {
  return EMAIL_SHAPE.test(em);
}

export { safeInlineMessage };
