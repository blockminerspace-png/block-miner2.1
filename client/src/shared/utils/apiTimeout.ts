import { isAxiosError } from 'axios';

/** Default HTTP client timeout — never below this (avoids accidental 2.5s-style misconfig). */
export const API_TIMEOUT_MS_DEFAULT = 60_000;

/** Login / register must survive Turnstile + DB lockout + 2FA email under load. */
export const API_TIMEOUT_MS_AUTH = 90_000;

export const API_TIMEOUT_MS_SESSION = 30_000;

export function resolveApiTimeoutMs(raw: string | undefined, floor = API_TIMEOUT_MS_DEFAULT): number {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  const parsed = Number.isFinite(n) && n > 0 ? n : API_TIMEOUT_MS_DEFAULT;
  return Math.max(floor, Math.min(parsed, 120_000));
}

export function isAxiosTimeoutError(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  if (error.code === 'ECONNABORTED') return true;
  return /timeout.*exceeded/i.test(String(error.message || ''));
}
