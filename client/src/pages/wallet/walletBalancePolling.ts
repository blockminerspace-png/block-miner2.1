import { isAxiosError } from 'axios';

export const WALLET_BALANCE_POLL_MS = 30_000;
export const WALLET_BALANCE_BACKOFF_MAX_MS = 120_000;

export type WalletHttpFailureKind = 'auth' | 'unavailable' | 'other' | null;

export function classifyWalletHttpError(err: unknown): WalletHttpFailureKind {
  if (!isAxiosError(err)) return 'other';
  const status = err.response?.status;
  if (status === 401) return 'auth';
  if (status === 502 || status === 503) return 'unavailable';
  return 'other';
}

export function nextWalletBalanceBackoffMs(currentMs: number): number {
  return Math.min(currentMs * 2, WALLET_BALANCE_BACKOFF_MAX_MS);
}
