/** @typedef {{ startsAt: Date|string, endsAt: Date|string, isActive: boolean, deletedAt?: Date|string|null }} OfferEventLike */

const CURRENCY_TO_USER_FIELD = {
  POL: "polBalance",
  BTC: "btcBalance",
  ETH: "ethBalance",
  USDT: "usdtBalance",
  USDC: "usdcBalance",
  ZER: "zerBalance"
};

export const SUPPORTED_OFFER_CURRENCIES = Object.keys(CURRENCY_TO_USER_FIELD);

export function normalizeOfferCurrency(currency) {
  const c = String(currency || "POL").toUpperCase();
  return CURRENCY_TO_USER_FIELD[c] ? c : "POL";
}

export function userBalanceFieldForCurrency(currency) {
  const c = normalizeOfferCurrency(currency);
  return CURRENCY_TO_USER_FIELD[c];
}

export function getUserBalanceNumber(user, currency) {
  const field = userBalanceFieldForCurrency(currency);
  return Number(user?.[field] ?? 0);
}

/**
 * Event is visible & purchasable in the active window (caller passes server "now").
 */
export function isOfferEventLiveAt(now, event) {
  if (!event || event.deletedAt) return false;
  if (!event.isActive) return false;
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  return t >= start && t <= end;
}

/**
 * For public listing: active flag, not soft-deleted, and window overlaps "now" (still running or upcoming within same filter — here: end >= now for "not fully ended" is wrong for spec).
 * Spec: only events within valid period AND active. So start <= now <= end.
 */
export function isOfferEventActiveForPublic(now, event) {
  return isOfferEventLiveAt(now, event);
}

export function hasEventMinerStock(miner) {
  if (!miner?.isActive) return false;
  if (miner.stockUnlimited) return true;
  if (miner.stockCount == null) return false;
  return miner.soldCount < miner.stockCount;
}

export function filterPublicOfferEvents(events, now) {
  return events.filter((e) => isOfferEventActiveForPublic(now, e));
}
