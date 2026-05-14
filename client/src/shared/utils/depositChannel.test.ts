import { describe, it, expect } from 'vitest';
import { canUseInjectedDepositChannel } from './depositChannel';

describe('canUseInjectedDepositChannel', () => {
  it('returns false when both are missing or invalid', () => {
    expect(canUseInjectedDepositChannel(null, null)).toBe(false);
    expect(canUseInjectedDepositChannel('', '')).toBe(false);
    expect(canUseInjectedDepositChannel('0x123', 'not-an-address')).toBe(false);
  });

  it('returns true when contract address is valid', () => {
    expect(
      canUseInjectedDepositChannel('0x0000000000000000000000000000000000000001', null),
    ).toBe(true);
  });

  it('returns true when treasury address is valid', () => {
    expect(
      canUseInjectedDepositChannel(null, '0x0000000000000000000000000000000000000002'),
    ).toBe(true);
  });

  it('returns true when both are valid', () => {
    expect(
      canUseInjectedDepositChannel(
        '0x0000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000002',
      ),
    ).toBe(true);
  });
});
