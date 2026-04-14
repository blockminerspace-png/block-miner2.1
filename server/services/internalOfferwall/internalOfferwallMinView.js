import { OFFER_KIND_PTC_IFRAME } from "./internalOfferwallConstants.js";

/**
 * Validates min-view elapsed time before submit.
 * PTC offers require partnerOpenedAt; elapsed is measured from that moment only.
 *
 * @param {{ offerKind: string, startedAt: Date, partnerOpenedAt: Date | null, now: Date, minViewSeconds: number }} p
 * @returns {{ ok: true } | { ok: false, code: string }}
 */
export function assertMinViewForSubmit({ offerKind, startedAt, partnerOpenedAt, now, minViewSeconds }) {
  const isPtc = String(offerKind || "").toUpperCase() === OFFER_KIND_PTC_IFRAME;
  const min = Math.max(0, Number(minViewSeconds) || 0);

  if (isPtc) {
    if (!partnerOpenedAt) {
      return { ok: false, code: "PARTNER_NOT_OPENED" };
    }
    const elapsedSec = (now.getTime() - partnerOpenedAt.getTime()) / 1000;
    if (elapsedSec < min) {
      return { ok: false, code: "MIN_VIEW_NOT_MET" };
    }
    return { ok: true };
  }

  const elapsedSec = (now.getTime() - startedAt.getTime()) / 1000;
  if (elapsedSec < min) {
    return { ok: false, code: "MIN_VIEW_NOT_MET" };
  }
  return { ok: true };
}
