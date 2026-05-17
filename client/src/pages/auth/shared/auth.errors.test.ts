import { describe, it, expect } from 'vitest';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { readAuthErrorMessage } from './auth.errors';

function ax(data: unknown, status: number): AxiosError {
  const err = new AxiosError('req failed');
  err.response = {
    data,
    status,
    statusText: 'Error',
    headers: {},
    config: {} as InternalAxiosRequestConfig,
  };
  return err;
}

describe('readAuthErrorMessage', () => {
  it('prefers first Zod validation message', () => {
    const msg = readAuthErrorMessage(
      ax({ errors: [{ path: 'email', message: 'Email inválido.' }] }, 400),
      'fallback',
    );
    expect(msg).toBe('Email inválido.');
  });

  it('reads message then error field', () => {
    expect(readAuthErrorMessage(ax({ message: ' A ' }, 400), 'f')).toBe('A');
    expect(readAuthErrorMessage(ax({ error: ' B ' }, 400), 'f')).toBe('B');
  });

  it('maps 429 without body', () => {
    expect(readAuthErrorMessage(ax({}, 429), 'f')).toContain('Muitas tentativas');
  });

  it('maps 401 without usable body', () => {
    expect(readAuthErrorMessage(ax({}, 401), 'f')).toContain('Credenciais');
  });

  it('uses fallback for unknown', () => {
    expect(readAuthErrorMessage(new Error(''), 'fb')).toBe('fb');
    expect(readAuthErrorMessage(null, 'fb')).toBe('fb');
  });
});
