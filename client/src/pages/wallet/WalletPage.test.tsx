import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const pagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'WalletPage.tsx');

describe('WalletPage smart_contract injected path', () => {
  it('uses injected wallet discovery module for browser deposit', () => {
    const src = readFileSync(pagePath, 'utf8');
    expect(src).toContain('getInjectedWalletProviders');
    expect(src).toContain('injected_scanning');
    expect(src).toContain('injected_detected_rabby');
  });

  it('does not require WalletConnect for smart_contract connect button', () => {
    const src = readFileSync(pagePath, 'utf8');
    expect(src).toContain("connect({ useBrowserExtension: true })");
    expect(src).not.toMatch(/smart_contract[\s\S]{0,400}connectWalletConnect\(\)/);
  });
});
