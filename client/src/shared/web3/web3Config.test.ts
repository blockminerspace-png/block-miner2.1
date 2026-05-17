import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getWalletConnectProjectId,
  isValidWalletConnectProjectId,
  isWalletConnectConfigured,
} from './web3Config';

describe('web3Config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('treats 00000000000000000000000000000000 as invalid', () => {
    expect(isValidWalletConnectProjectId('00000000000000000000000000000000')).toBe(false);
  });

  it('treats empty string as invalid', () => {
    expect(isValidWalletConnectProjectId('')).toBe(false);
    expect(isValidWalletConnectProjectId('   ')).toBe(false);
  });

  it('accepts 32-char hex project ids', () => {
    expect(isValidWalletConnectProjectId('a1b2c3d4e5f6789012345678abcdef01')).toBe(true);
    expect(isValidWalletConnectProjectId('A1B2C3D4E5F6789012345678ABCDEF01')).toBe(true);
  });

  it('rejects non-hex and wrong length', () => {
    expect(isValidWalletConnectProjectId('not-a-hex-string-here-at-all')).toBe(false);
    expect(isValidWalletConnectProjectId('abcd')).toBe(false);
  });

  it('isWalletConnectConfigured reflects env when stubbed', () => {
    vi.stubEnv('VITE_WALLETCONNECT_PROJECT_ID', '');
    vi.stubEnv('VITE_REOWN_PROJECT_ID', '');
    expect(isWalletConnectConfigured()).toBe(false);

    vi.stubEnv('VITE_WALLETCONNECT_PROJECT_ID', '0123456789abcdef0123456789abcdef');
    expect(isWalletConnectConfigured()).toBe(true);
  });

  it('reads VITE_WALLETCONNECT_PROJECT_ID from import.meta.env', () => {
    vi.stubEnv('VITE_WALLETCONNECT_PROJECT_ID', '  fedcba0987654321fedcba0987654321  ');
    vi.stubEnv('VITE_REOWN_PROJECT_ID', '');
    expect(getWalletConnectProjectId()).toBe('fedcba0987654321fedcba0987654321');
  });

  it('falls back to VITE_REOWN_PROJECT_ID when WC id unset', () => {
    vi.stubEnv('VITE_WALLETCONNECT_PROJECT_ID', '');
    vi.stubEnv('VITE_REOWN_PROJECT_ID', '0123456789abcdef0123456789abcdef');
    expect(getWalletConnectProjectId()).toBe('0123456789abcdef0123456789abcdef');
  });
});

describe('auth pages do not reference Web3Providers prefetch', () => {
  const web3Dir = dirname(fileURLToPath(import.meta.url));
  const clientRoot = join(web3Dir, '..', '..', '..');

  it('LoginPage.tsx has no Web3Providers import', () => {
    const src = readFileSync(join(clientRoot, 'src/pages/auth/login/LoginPage.tsx'), 'utf8');
    expect(src).not.toMatch(/Web3Providers/);
  });

  it('RegisterPage.tsx has no Web3Providers import', () => {
    const src = readFileSync(join(clientRoot, 'src/pages/auth/register/RegisterPage.tsx'), 'utf8');
    expect(src).not.toMatch(/Web3Providers/);
  });
});
