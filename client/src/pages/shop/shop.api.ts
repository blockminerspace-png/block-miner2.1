import { api } from '../../store/auth';

export interface ShopCatalogMiner {
  id: number;
  slotSize?: number;
  imageUrl?: string;
  name?: string;
  baseHashRate?: number;
  price?: number | string;
}

export interface ShopMinersResponse {
  ok?: boolean;
  miners?: ShopCatalogMiner[];
}

export function getShopMiners() {
  return api.get<ShopMinersResponse>('/shop/miners');
}

export function postShopPurchase(body: Record<string, unknown>) {
  return api.post('/shop/purchase', body);
}

