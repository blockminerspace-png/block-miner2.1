import { describe, it, expect } from 'vitest';
import { responseRequiresTwoFactorStep } from '../../src/pages/auth/login/login.twoFactorUi';

describe('responseRequiresTwoFactorStep', () => {
  it('is false when backend sends neither flag nor known code', () => {
    expect(responseRequiresTwoFactorStep({})).toBe(false);
    expect(responseRequiresTwoFactorStep({ code: 'INVALID_CREDENTIALS' })).toBe(false);
  });

  it('is true for require2FA', () => {
    expect(responseRequiresTwoFactorStep({ require2FA: true })).toBe(true);
  });

  it('is true for TWO_FACTOR_REQUIRED or legacy REQUIRE_2FA code', () => {
    expect(responseRequiresTwoFactorStep({ code: 'TWO_FACTOR_REQUIRED' })).toBe(true);
    expect(responseRequiresTwoFactorStep({ code: 'REQUIRE_2FA' })).toBe(true);
  });
});
