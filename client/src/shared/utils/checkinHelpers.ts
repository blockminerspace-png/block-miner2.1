import type { CheckinCadenceDailySlice, CheckinStatusPayload } from '../../types/checkin';

/** Polygon tx hash (0x + 64 hex). */
export const POLYGON_TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/** Brazil daily key YYYY-MM-DD (defensive display filter). */
export const BRAZIL_DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function weiHexFromDecimalString(weiStr: string): string {
  try {
    const v = BigInt(weiStr);
    return `0x${v.toString(16)}`;
  } catch {
    return '0x0';
  }
}

export function formatPolFromWei(weiStr: string): string {
  try {
    const n = Number(BigInt(weiStr)) / 1e18;
    if (n >= 1) return n.toFixed(4).replace(/\.?0+$/, '');
    return n.toFixed(6).replace(/\.?0+$/, '');
  } catch {
    return '?';
  }
}

export function mergeStatus(prev: CheckinStatusPayload | null, incoming: CheckinStatusPayload | null): CheckinStatusPayload | null {
  if (!incoming) return prev;
  return { ...(prev || {}), ...incoming };
}

export function getDailySlice(status: CheckinStatusPayload | null): CheckinCadenceDailySlice {
  const from = status?.cadenceStatus?.daily;
  if (from) return from;
  return {
    periodKey: '',
    checkedIn: Boolean(status?.checkedIn),
    pending: Boolean(status?.pending),
    failed: Boolean(status?.failed),
    status: status?.status ?? null,
    txHash: status?.txHash ?? null,
  };
}

export function cadenceSliceNeedsPoll(cs: CheckinCadenceDailySlice | null | undefined): boolean {
  return Boolean(cs?.pending || (cs?.txHash && !cs?.checkedIn && !cs?.failed));
}

export function statusNeedsCheckinPoll(s: CheckinStatusPayload | null | undefined): boolean {
  if (!s?.paymentRequired || !s) return false;
  if (s.cadenceStatus) {
    return cadenceSliceNeedsPoll(getDailySlice(s));
  }
  return Boolean(s.pending || (s.txHash && !s.checkedIn && !s.failed));
}

/**
 * Only allow safe hex tx id in Polygonscan URL (prevents odd server values becoming navigable elsewhere).
 */
export function buildPolygonscanTxUrl(txHash: string | null | undefined): string | null {
  if (!txHash || typeof txHash !== 'string') return null;
  const t = txHash.trim();
  if (!POLYGON_TX_HASH_RE.test(t)) return null;
  return `https://polygonscan.com/tx/${encodeURIComponent(t)}`;
}

/** Strip control chars and angle brackets for any admin-editable milestone copy (React already escapes; belt + suspenders). */
export function sanitizeCheckinUiText(input: unknown, maxLen: number): string {
  if (input == null) return '';
  return String(input)
    .replace(/[\u0000-\u001F<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function isValidHistoryDateKey(date: string): boolean {
  return typeof date === 'string' && BRAZIL_DATE_KEY_RE.test(date.trim());
}

/**
 * Floor POL (human decimal from API) to wei as bigint — avoids float compare bugs near thresholds.
 * Uses `toFixed(18)` then splits integer/fractional part (best effort for JSON number precision).
 */
export function polNumberToWeiFloor(pol: number): bigint {
  if (!Number.isFinite(pol) || pol <= 0) return 0n;
  const s = pol.toFixed(18);
  const [whole, frac = ''] = s.split('.');
  const intPart = whole.replace(/^0+(?=\d)/, '') || '0';
  const frac18 = (frac + '0'.repeat(18)).slice(0, 18);
  try {
    return BigInt(intPart) * 10n ** 18n + BigInt(frac18);
  } catch {
    return 0n;
  }
}

/** True when in-game POL balance covers the configured balance check-in cost (wei). */
export function balanceCoversWeiCost(polBalance: number, costWeiStr: string): boolean {
  try {
    const cost = BigInt(costWeiStr);
    if (cost <= 0n) return true;
    const balWei = polNumberToWeiFloor(polBalance);
    // +1 wei: JSON / IEEE float can sit 1 wei below the exact POL decimal (e.g. 0.03).
    return balWei + 1n >= cost;
  } catch {
    return false;
  }
}
