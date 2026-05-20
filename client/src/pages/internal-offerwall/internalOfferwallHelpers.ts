import type { InternalOfferwallOffer, IoTranslate } from './internalOfferwallTypes';

/**
 * Opens the partner URL in a new tab with a full document URL as Referer.
 * Our nginx sets Referrer-Policy: strict-origin-when-cross-origin, which truncates cross-origin
 * referrers to the origin only; some PTC partners (e.g. traffic exchanges) reject that as "direct".
 * A real <a> click with referrerPolicy "unsafe-url" overrides policy for this navigation only.
 * Use rel="noopener" but NOT "noreferrer" — noreferrer strips the Referer header entirely.
 */
export function openPartnerWithReferrer(url: string): boolean {
  const u = String(url || '').trim();
  if (!u) return false;
  const a = document.createElement('a');
  a.href = u;
  a.target = '_blank';
  a.rel = 'noopener';
  a.referrerPolicy = 'unsafe-url';
  a.setAttribute('aria-hidden', 'true');
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

export function formatHoursClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function rewardLine(t: IoTranslate, offer: InternalOfferwallOffer): string {
  const k = String(offer.rewardKind || '').toUpperCase();
  if (k === 'BLK' && offer.rewardBlkAmount != null) {
    return t('internalOfferwallPage.reward_blk', { amount: String(offer.rewardBlkAmount) });
  }
  if (k === 'POL' && offer.rewardPolAmount != null) {
    return t('internalOfferwallPage.reward_pol', { amount: String(offer.rewardPolAmount) });
  }
  if (k === 'HASHRATE_TEMP') {
    return t('internalOfferwallPage.reward_hashrate', {
      hashRate: offer.rewardHashRate ?? 0,
      days: offer.rewardHashRateDays ?? 1
    });
  }
  return k;
}
