import { stripDangerousAsciiControls } from './authInputGuards';

const LINK_REF_CODE_MAX = 64;

/**
 * Referral link field: numeric user id or alphanumeric ref code (see server `linkReferral`).
 * Strips controls and clamps length so the client never POSTs oversized / odd payloads.
 */
export function sanitizeDashboardReferralCode(raw: string): string {
  const t = stripDangerousAsciiControls(String(raw ?? '').trim()).slice(0, LINK_REF_CODE_MAX);
  if (/^\d+$/.test(t)) return t.replace(/^0+/, '') || '0';
  return t.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function safeDashboardNumber(value: unknown, fractionDigits: number): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(fractionDigits);
}
