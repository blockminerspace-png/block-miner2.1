import { api } from '../store/auth';
import type { CheckinPostPayload, CheckinStatusPayload } from '../types/checkin';

/** GET /api/checkin/status — typed envelope (caller validates `ok`). */
export async function fetchCheckinStatus(): Promise<CheckinStatusPayload> {
  const res = await api.get<CheckinStatusPayload>('/checkin/status');
  return res.data;
}

/** POST /api/checkin/balance — in-game POL debit path. */
export async function postCheckinBalanceDaily(): Promise<CheckinPostPayload> {
  const res = await api.post<CheckinPostPayload>('/checkin/balance', { cadence: 'daily' });
  return res.data;
}

/** POST /api/checkin/wallet — after client sends on-chain tx. */
export async function postCheckinWalletDaily(txHash: string): Promise<CheckinPostPayload> {
  const res = await api.post<CheckinPostPayload>('/checkin/wallet', {
    txHash: txHash.trim(),
    cadence: 'daily',
  });
  return res.data;
}
