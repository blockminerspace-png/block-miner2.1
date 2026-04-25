import { describe, expect, it } from 'vitest';
import { validateAdminInternalOfferwallForm } from './adminInternalOfferwallValidate.js';

function baseForm(overrides = {}) {
  return {
    kind: 'PTC_IFRAME',
    title: 'Test offer',
    description: '',
    iframeUrl: 'https://zerads.com/',
    minViewSeconds: '10',
    dailyLimitPerUser: '3',
    rewardKind: 'BLK',
    rewardBlkAmount: '0.01',
    rewardPolAmount: '0.01',
    rewardHashRate: '5',
    rewardHashRateDays: '1',
    completionMode: 'USER_SELF_CLAIM',
    sortOrder: '0',
    isActive: true,
    requiredActionsText: '',
    targetCountryCodes: '',
    externalInfoUrl: '',
    verificationNote: '',
    ...overrides
  };
}

describe('validateAdminInternalOfferwallForm', () => {
  it('accepts a valid PTC form', () => {
    expect(validateAdminInternalOfferwallForm(baseForm())).toEqual({ ok: true });
  });

  it('rejects empty title', () => {
    const r = validateAdminInternalOfferwallForm(baseForm({ title: '   ' }));
    expect(r.ok).toBe(false);
    expect(r.i18nKey).toBe('admin_internal_offerwall.validation_title_required');
  });

  it('rejects invalid iframe URL for PTC', () => {
    const r = validateAdminInternalOfferwallForm(baseForm({ iframeUrl: 'https://' }));
    expect(r.ok).toBe(false);
    expect(r.i18nKey).toBe('admin_internal_offerwall.validation_iframe_invalid');
  });

  it('rejects empty iframe for PTC', () => {
    const r = validateAdminInternalOfferwallForm(baseForm({ iframeUrl: '' }));
    expect(r.ok).toBe(false);
    expect(r.i18nKey).toBe('admin_internal_offerwall.validation_iframe_required');
  });

  it('rejects invalid ISO2 country codes', () => {
    const r = validateAdminInternalOfferwallForm(baseForm({ targetCountryCodes: 'BRA, US' }));
    expect(r.ok).toBe(false);
    expect(r.i18nKey).toBe('admin_internal_offerwall.validation_country_iso2');
  });

  it('accepts GENERAL_TASK with optional empty external URL', () => {
    expect(
      validateAdminInternalOfferwallForm(
        baseForm({
          kind: 'GENERAL_TASK',
          iframeUrl: '',
          externalInfoUrl: ''
        })
      )
    ).toEqual({ ok: true });
  });
});
