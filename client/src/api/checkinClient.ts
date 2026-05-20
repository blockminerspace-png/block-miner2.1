import { api } from '../store/auth';
import type { CheckinPostPayload, CheckinStatusPayload } from '../types/checkin';

/** GET /api/checkin/status — typed envelope (caller validates `ok`). */
export async function fetchCheckinStatus(): Promise<CheckinStatusPayload> {
  const res = await api.get<CheckinStatusPayload>('/checkin/status');
  return res.data;
}

/** POST /api/checkin/claim — offchain/balance path (hybrid/offchain modes). */
export async function postCheckinClaimDaily(): Promise<CheckinPostPayload> {
  const res = await api.post<CheckinPostPayload>('/checkin/claim', { cadence: 'daily', method: 'offchain' });
  return res.data;
}

/** POST /api/checkin/balance — in-game POL debit path. */
export async function postCheckinBalanceDaily(): Promise<CheckinPostPayload> {
  const res = await api.post<CheckinPostPayload>('/checkin/balance', { cadence: 'daily' });
  return res.data;
}

export type CheckinWalletConfirmPayload = {
  txHash: string;
  walletAddress: string;
  chainId: number;
};

/** POST /api/checkin/wallet — after client sends on-chain tx (backend validates on-chain). */
export async function postCheckinWalletDaily(payload: CheckinWalletConfirmPayload): Promise<CheckinPostPayload> {
  const res = await api.post<CheckinPostPayload>('/checkin/wallet', {
    txHash: payload.txHash.trim(),
    walletAddress: payload.walletAddress.trim(),
    chainId: payload.chainId,
    cadence: 'daily',
  });
  return res.data;
}
