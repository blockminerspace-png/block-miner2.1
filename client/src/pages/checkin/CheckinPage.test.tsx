import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const pagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'CheckinPage.tsx');

describe('CheckinPage module', () => {
  it('does not import WalletConnect, Reown, AppKit, or useWallet', () => {
    const src = readFileSync(pagePath, 'utf8');
    expect(src).not.toMatch(/WalletConnect|Reown|AppKit|Web3Providers|createAppKit|useWallet/);
    expect(src).toContain('./checkin.wallet');
    expect(src).toContain('./checkin.contract');
  });
});
