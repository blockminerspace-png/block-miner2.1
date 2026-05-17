import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../../store/auth';
import { walletApi } from './wallet.api';

describe('walletApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getBalance requests /wallet/balance', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { ok: true, balance: 1 } });
    const res = await walletApi.getBalance();
    expect(api.get).toHaveBeenCalledWith('/wallet/balance');
    expect(res.data.ok).toBe(true);
  });

  it('postWithdraw posts JSON body to /wallet/withdraw', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: { ok: true } });
    const body = { amount: 10, address: '0x000000000000000000000000000000000000dead' };
    await walletApi.postWithdraw(body);
    expect(api.post).toHaveBeenCalledWith('/wallet/withdraw', body);
  });

  it('getBtcpayInvoiceStatus encodes invoice id in the URL path', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { ok: true } });
    await walletApi.getBtcpayInvoiceStatus('inv/with%chars');
    expect(api.get).toHaveBeenCalledWith('/wallet/btcpay/invoice/inv%2Fwith%25chars');
  });
});
