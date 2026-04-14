/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { readCsrfCookie, csrfHeaderObject } from './csrfHeader.js';

describe('csrfHeader', () => {

  it('reads blockminer_csrf from document.cookie', () => {
    document.cookie = 'blockminer_csrf=token123; path=/';
    expect(readCsrfCookie()).toBe('token123');
    expect(csrfHeaderObject()).toEqual({ 'x-csrf-token': 'token123' });
  });

  it('returns empty object when csrf cookie is absent', () => {
    document.cookie =
      'blockminer_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    document.cookie = 'other=value; path=/';
    expect(readCsrfCookie()).toBe('');
    expect(csrfHeaderObject()).toEqual({});
  });
});
