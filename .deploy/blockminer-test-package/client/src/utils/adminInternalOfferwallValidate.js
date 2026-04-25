const KIND_PTC = 'PTC_IFRAME';
const KIND_GEN = 'GENERAL_TASK';

/**
 * @param {string} raw
 * @returns {URL | null}
 */
function tryParseUrl(raw) {
  try {
    return new URL(String(raw).trim());
  } catch {
    return null;
  }
}

/**
 * Client-side validation aligned with server parseAdminOfferBody / normalizeTaskMetadata.
 * @param {Record<string, unknown>} form
 * @returns {{ ok: true } | { ok: false, i18nKey: string }}
 */
export function validateAdminInternalOfferwallForm(form) {
  const title = String(form.title || '').trim();
  if (!title) {
    return { ok: false, i18nKey: 'admin_internal_offerwall.validation_title_required' };
  }
  if (title.length > 200) {
    return { ok: false, i18nKey: 'admin_internal_offerwall.validation_title_too_long' };
  }

  const minSec = parseInt(String(form.minViewSeconds ?? ''), 10);
  if (!Number.isInteger(minSec) || minSec < 0 || minSec > 7200) {
    return { ok: false, i18nKey: 'admin_internal_offerwall.validation_min_view_range' };
  }

  const maxExec = parseInt(String(form.maxExecutionsPerPeriod ?? form.dailyLimitPerUser ?? ''), 10);
  if (!Number.isInteger(maxExec) || maxExec < 1 || maxExec > 50) {
    return { ok: false, i18nKey: 'admin_internal_offerwall.validation_max_executions_range' };
  }

  const rt = String(form.resetType || 'DAILY').trim().toUpperCase();
  if (rt !== 'DAILY' && rt !== 'COOLDOWN') {
    return { ok: false, i18nKey: 'admin_internal_offerwall.validation_reset_type' };
  }
  if (rt === 'COOLDOWN') {
    const cd = parseInt(String(form.cooldownSeconds ?? ''), 10);
    if (!Number.isInteger(cd) || cd < 60 || cd > 604800) {
      return { ok: false, i18nKey: 'admin_internal_offerwall.validation_cooldown_range' };
    }
  }

  if (String(form.kind) === KIND_PTC) {
    const raw = String(form.iframeUrl || '').trim();
    if (!raw) {
      return { ok: false, i18nKey: 'admin_internal_offerwall.validation_iframe_required' };
    }
    const u = tryParseUrl(raw);
    if (!u) {
      return { ok: false, i18nKey: 'admin_internal_offerwall.validation_iframe_invalid' };
    }
    const proto = u.protocol.replace(':', '').toLowerCase();
    if (proto !== 'https' && proto !== 'http') {
      return { ok: false, i18nKey: 'admin_internal_offerwall.validation_iframe_https' };
    }
    const host = u.hostname.toLowerCase();
    if (!host || host === 'localhost') {
      return { ok: false, i18nKey: 'admin_internal_offerwall.validation_iframe_host' };
    }
  }

  if (String(form.kind) === KIND_GEN) {
    const ext = String(form.externalInfoUrl || '').trim();
    if (ext && ext !== 'https://' && ext !== 'http://') {
      const u = tryParseUrl(ext);
      if (!u) {
        return { ok: false, i18nKey: 'admin_internal_offerwall.validation_external_url_invalid' };
      }
      const proto = u.protocol.replace(':', '').toLowerCase();
      if (proto !== 'https' && proto !== 'http') {
        return { ok: false, i18nKey: 'admin_internal_offerwall.validation_external_url_invalid' };
      }
      const host = u.hostname.toLowerCase();
      if (!host || host === 'localhost') {
        return { ok: false, i18nKey: 'admin_internal_offerwall.validation_external_url_invalid' };
      }
    }
  }

  const rk = String(form.rewardKind || '').toUpperCase();
  if (rk === 'BLK') {
    const a = parseFloat(String(form.rewardBlkAmount ?? '').replace(',', '.'));
    if (!Number.isFinite(a) || a <= 0) {
      return { ok: false, i18nKey: 'admin_internal_offerwall.validation_reward_blk_positive' };
    }
  } else if (rk === 'POL') {
    const a = parseFloat(String(form.rewardPolAmount ?? '').replace(',', '.'));
    if (!Number.isFinite(a) || a <= 0) {
      return { ok: false, i18nKey: 'admin_internal_offerwall.validation_reward_pol_positive' };
    }
  } else if (rk === 'HASHRATE_TEMP') {
    const hr = parseFloat(String(form.rewardHashRate ?? '').replace(',', '.'));
    const days = parseInt(String(form.rewardHashRateDays ?? ''), 10);
    if (!Number.isFinite(hr) || hr <= 0) {
      return { ok: false, i18nKey: 'admin_internal_offerwall.validation_reward_hr_positive' };
    }
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return { ok: false, i18nKey: 'admin_internal_offerwall.validation_reward_days_range' };
    }
  }

  const lines = String(form.requiredActionsText || '').split(/\r?\n/);
  for (const line of lines) {
    if (String(line).trim().length > 500) {
      return { ok: false, i18nKey: 'admin_internal_offerwall.validation_action_line_too_long' };
    }
  }

  const parts = String(form.targetCountryCodes || '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  for (const c of parts) {
    if (!/^[A-Za-z]{2}$/.test(c)) {
      return { ok: false, i18nKey: 'admin_internal_offerwall.validation_country_iso2' };
    }
  }

  return { ok: true };
}
