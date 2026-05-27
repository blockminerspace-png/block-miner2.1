import { api } from '../../store/auth';

export type WalletBalancePayload = {
  ok?: boolean;
  balance?: unknown;
  blkBalance?: unknown;
};

export async function getWalletBalance(): Promise<WalletBalancePayload> {
  const res = await api.get<WalletBalancePayload>('/wallet/balance');
  return res.data;
}

export async function postLinkReferral(refCode: string): Promise<{ ok?: boolean; message?: string }> {
  const res = await api.post<{ ok?: boolean; message?: string }>('/user/link-referral', { refCode });
  return res.data;
}

export type AllocationResponse = {
  ok?: boolean;
  polBps?: number;
  shibBps?: number;
  message?: string;
};

/** Persist the user's POL/SHIB hashrate allocation. polBps in 0..10000 (server snaps to nearest 500). */
export async function patchMiningAllocation(polBps: number): Promise<AllocationResponse> {
  const res = await api.patch<AllocationResponse>('/mining/allocation', { polBps });
  return res.data;
}
