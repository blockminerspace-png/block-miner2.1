import { describe, it, expect } from 'vitest';
import {
  clipRefCodeFromQuery,
  sanitizeRegisterUsername,
  sanitizeRegisterEmail,
  sanitizeRegisterRefCode,
  validateUsernameShape,
  validateEmailShape,
} from './registerInputGuards';
import { REGISTER_USERNAME_MAX, REGISTER_REF_CODE_MAX_LEN } from '../../constants/registerFieldLimits';

describe('registerInputGuards', () => {
  it('clips ref from query to alnum prefix', () => {
    expect(clipRefCodeFromQuery('ab-12_cd#extra')).toBe('ab12cdextra');
    expect(clipRefCodeFromQuery('x'.repeat(100)).length).toBe(REGISTER_REF_CODE_MAX_LEN);
  });

  it('sanitizes username length and controls', () => {
    expect(sanitizeRegisterUsername(`a\u0000${'b'.repeat(REGISTER_USERNAME_MAX + 5)}`).length).toBe(REGISTER_USERNAME_MAX);
  });

  it('sanitizes email to lowercase and strips controls', () => {
    expect(sanitizeRegisterEmail(' Test\u0007@Mail.COM ')).toBe('test@mail.com');
  });

  it('sanitizes ref code to alnum', () => {
    expect(sanitizeRegisterRefCode('ab-12')).toBe('ab12');
  });

  it('validates shapes', () => {
    expect(validateUsernameShape('miner_1')).toBe(true);
    expect(validateUsernameShape('bad space')).toBe(false);
    expect(validateEmailShape('a@b.co')).toBe(true);
    expect(validateEmailShape('not-email')).toBe(false);
  });
});
