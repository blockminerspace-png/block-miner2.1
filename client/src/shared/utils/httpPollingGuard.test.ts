import { describe, it, expect } from 'vitest';
import { readAxiosHttpStatus, shouldStopApiPolling } from './httpPollingGuard';

describe('shouldStopApiPolling', () => {
  it('stops on auth and server errors', () => {
    expect(shouldStopApiPolling(401)).toBe(true);
    expect(shouldStopApiPolling(500)).toBe(true);
    expect(shouldStopApiPolling(503)).toBe(true);
  });

  it('allows retry on transient client errors', () => {
    expect(shouldStopApiPolling(429)).toBe(false);
    expect(shouldStopApiPolling(undefined)).toBe(false);
  });
});

describe('readAxiosHttpStatus', () => {
  it('returns undefined for non-axios errors', () => {
    expect(readAxiosHttpStatus(new Error('x'))).toBeUndefined();
  });
});
