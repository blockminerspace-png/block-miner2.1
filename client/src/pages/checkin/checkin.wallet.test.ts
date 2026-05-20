import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getExpectedCheckinChainId, hasInjectedWallet } from './checkin.wallet';

describe('checkin.wallet', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_CHECKIN_CHAIN_ID', '137');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults chain id to Polygon 137', () => {
    expect(getExpectedCheckinChainId()).toBe(137);
  });

  it('reports no injected wallet when window has no provider', () => {
    expect(hasInjectedWallet()).toBe(false);
  });
});
