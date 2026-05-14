import { api } from '../../store/auth';

export interface OfferEventMinerDTO {
  id: number;
  isFree?: boolean;
  price?: number | string;
  claimLimitPerUser?: number;
  userClaimCount?: number;
  remaining?: number | null;
  imageUrl?: string | null;
  name?: string;
  hashRate?: number | string;
  inStock?: boolean;
  currency?: string;
  effectivelyFree?: boolean;
}

export interface OfferEventDTO {
  id: number;
  title?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  isLive?: boolean;
  miners?: OfferEventMinerDTO[];
}

export interface OfferEventsListResponse {
  ok?: boolean;
  events?: OfferEventDTO[];
}

export function getActiveOfferEvents() {
  return api.get<OfferEventsListResponse>('/offer-events/active');
}

export function postOfferEventPurchase(body: { eventMinerId: number; quantity: number }) {
  return api.post('/offer-events/purchase', body);
}

