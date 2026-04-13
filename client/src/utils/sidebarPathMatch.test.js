import { describe, it, expect } from 'vitest';
import { pathMatchesNavChild } from './sidebarPathMatch.js';

describe('pathMatchesNavChild', () => {
  it('matches exact path', () => {
    expect(pathMatchesNavChild('/faucet', '/faucet')).toBe(true);
  });

  it('matches nested path', () => {
    expect(pathMatchesNavChild('/faucet/extra', '/faucet')).toBe(true);
  });

  it('rejects unrelated path', () => {
    expect(pathMatchesNavChild('/dashboard', '/faucet')).toBe(false);
  });

  it('rejects prefix false positive', () => {
    expect(pathMatchesNavChild('/faucet-scam', '/faucet')).toBe(false);
  });
});
