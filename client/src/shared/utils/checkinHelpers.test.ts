import { describe, it, expect } from 'vitest';
import { balanceCoversWeiCost, polNumberToWeiFloor, POLYGON_TX_HASH_RE } from './checkinHelpers';

describe('polNumberToWeiFloor', () => {
  it('maps integer POL to wei', () => {
    expect(polNumberToWeiFloor(1)).toBe(10n ** 18n);
  });

  it('floors fractional POL (float may sit slightly below decimal)', () => {
    const w = polNumberToWeiFloor(0.03);
    expect(w + 1n).toBeGreaterThanOrEqual(BigInt('30000000000000000'));
    expect(w).toBeLessThan(BigInt('30000000000000000'));
  });

  it('returns 0 for non-finite', () => {
    expect(polNumberToWeiFloor(NaN)).toBe(0n);
    expect(polNumberToWeiFloor(Infinity)).toBe(0n);
    expect(polNumberToWeiFloor(-1)).toBe(0n);
  });
});

describe('balanceCoversWeiCost', () => {
  it('allows large in-game balance vs 0.03 POL cost', () => {
    const costWei = '30000000000000000';
    expect(balanceCoversWeiCost(8603.1237, costWei)).toBe(true);
    expect(balanceCoversWeiCost(0.02, costWei)).toBe(false);
    expect(balanceCoversWeiCost(0.03, costWei)).toBe(true);
  });

  it('returns false on bad wei string', () => {
    expect(balanceCoversWeiCost(100, 'not-wei')).toBe(false);
  });
});

describe('POLYGON_TX_HASH_RE', () => {
  it('accepts canonical tx hash', () => {
    const h = `0x${'a'.repeat(64)}`;
    expect(POLYGON_TX_HASH_RE.test(h)).toBe(true);
  });
});
