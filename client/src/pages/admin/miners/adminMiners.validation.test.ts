import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import {
  ADMIN_MINERS_SCHEMA_OUT_OF_DATE,
  ADMIN_MINERS_SCHEMA_OUT_OF_DATE_MESSAGE,
  adminMinersListErrorMessage,
  isAdminMinersSchemaOutOfDate,
} from './adminMiners.validation';

describe('adminMiners.validation', () => {
  it('detects schema out of date from axios response', () => {
    const err = new AxiosError('Service Unavailable', '503', undefined, undefined, {
      status: 503,
      data: { ok: false, code: ADMIN_MINERS_SCHEMA_OUT_OF_DATE, message: 'migration required' },
      statusText: 'Service Unavailable',
      headers: {},
      config: {} as never,
    });
    expect(isAdminMinersSchemaOutOfDate(err)).toBe(true);
    expect(adminMinersListErrorMessage(err)).toBe(ADMIN_MINERS_SCHEMA_OUT_OF_DATE_MESSAGE);
  });
});
