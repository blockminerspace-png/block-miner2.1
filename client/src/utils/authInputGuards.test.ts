import { describe, it, expect } from 'vitest';
import {
  clampLoginIdentifier,
  clampLoginPassword,
  normalizeTwoFactorInput,
  validateLoginIdentifierForSubmit,
  validateLoginPasswordForSubmit,
  validateTwoFactorForSubmit,
  stripDangerousAsciiControls,
  safeInlineMessage,
  LOGIN_IDENTIFIER_MAX_LEN,
  LOGIN_PASSWORD_MAX_LEN,
} from './authInputGuards';

describe('authInputGuards', () => {
  it('strips ASCII controls from identifier', () => {
    expect(stripDangerousAsciiControls('a\u0000b')).toBe('ab');
  });

  it('clamps identifier length', () => {
    const long = 'x'.repeat(LOGIN_IDENTIFIER_MAX_LEN + 40);
    expect(clampLoginIdentifier(long).length).toBe(LOGIN_IDENTIFIER_MAX_LEN);
  });

  it('clamps password and removes null bytes', () => {
    expect(clampLoginPassword('a\u0000b').length).toBeLessThanOrEqual(LOGIN_PASSWORD_MAX_LEN);
    expect(clampLoginPassword('a\u0000b')).toBe('ab');
  });

  it('normalizes 2FA to digits only', () => {
    expect(normalizeTwoFactorInput('12a34b56')).toBe('123456');
  });

  it('validates login fields', () => {
    expect(validateLoginIdentifierForSubmit('')).toBe('empty');
    expect(validateLoginPasswordForSubmit('')).toBe('empty');
    expect(validateTwoFactorForSubmit('12345')).toBe('incomplete');
    expect(validateTwoFactorForSubmit('123456')).toBe(null);
    expect(validateTwoFactorForSubmit('12x456')).toBe('invalid');
  });

  it('safeInlineMessage strips angle brackets', () => {
    expect(safeInlineMessage('<script>x</script>')).toBe('scriptx/script');
  });
});
