import { describe, it, expect } from 'vitest';
import { resolveCheckinPaymentTarget } from './checkin.contract';
import type { CheckinStatusPayload } from '../../types/checkin';

describe('resolveCheckinPaymentTarget', () => {
  it('uses treasury receiver when no contract is configured', () => {
    const status: CheckinStatusPayload = {
      ok: true,
      checkinReceiver: '0x1111111111111111111111111111111111111111',
      checkinAmountWei: '10000000000000000',
    };
    const target = resolveCheckinPaymentTarget(status);
    expect(target?.mode).toBe('treasury');
    expect(target?.address).toBe('0x1111111111111111111111111111111111111111');
  });

  it('returns null when amount is missing', () => {
    const status: CheckinStatusPayload = {
      ok: true,
      checkinReceiver: '0x1111111111111111111111111111111111111111',
    };
    expect(resolveCheckinPaymentTarget(status)).toBeNull();
  });
});
