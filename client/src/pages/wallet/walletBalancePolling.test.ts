import { describe, it, expect } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import {
  classifyWalletHttpError,
  nextWalletBalanceBackoffMs,
  WALLET_BALANCE_POLL_MS,
  WALLET_BALANCE_BACKOFF_MAX_MS,
} from './walletBalancePolling';

function axiosErrorWithStatus(status: number): AxiosError {
  return new AxiosError('fail', String(status), undefined, undefined, {
    status,
    statusText: 'err',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: {},
  });
}

describe('walletBalancePolling', () => {
  it('classifies auth and gateway errors', () => {
    expect(classifyWalletHttpError(axiosErrorWithStatus(401))).toBe('auth');
    expect(classifyWalletHttpError(axiosErrorWithStatus(502))).toBe('unavailable');
    expect(classifyWalletHttpError(axiosErrorWithStatus(503))).toBe('unavailable');
    expect(classifyWalletHttpError(new Error('x'))).toBe('other');
  });

  it('doubles backoff up to max', () => {
    expect(nextWalletBalanceBackoffMs(WALLET_BALANCE_POLL_MS)).toBe(WALLET_BALANCE_POLL_MS * 2);
    expect(nextWalletBalanceBackoffMs(WALLET_BALANCE_BACKOFF_MAX_MS)).toBe(WALLET_BALANCE_BACKOFF_MAX_MS);
  });
});
