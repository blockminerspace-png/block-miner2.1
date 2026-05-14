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
