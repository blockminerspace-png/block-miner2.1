import type { AxiosResponse } from 'axios';
import { api } from '../../store/auth';
import type {
  WalletBalanceResponse,
  WalletBtcpayInvoicePollResponse,
  WalletBtcpayInvoicePostResponse,
  WalletDepositGasEstimateResponse,
  WalletDepositSubmitResponse,
  WalletDepositTicketPostResponse,
  WalletDepositTicketsResponse,
  WalletHdAddressResponse,
  WalletLinkChallengeResponse,
  WalletLinkVerifyResponse,
  WalletMeResponse,
  WalletPendingDepositsResponse,
  WalletPolUsdResponse,
  WalletTransactionsResponse,
  WalletWithdrawRequestBody,
  WalletWithdrawResponse,
} from './wallet.types';

/** Cliente da Carteira — paths relativos a `/api` (axios `baseURL`). */
export const walletApi = {
  getPolUsd: (): Promise<AxiosResponse<WalletPolUsdResponse>> => api.get('/wallet/pol-usd'),
  getWalletMe: (): Promise<AxiosResponse<WalletMeResponse>> => api.get('/wallet/me'),
  postWalletLinkChallenge: (body: {
    address: string;
    chainId: number;
  }): Promise<AxiosResponse<WalletLinkChallengeResponse>> => api.post('/wallet/link/challenge', body),
  postWalletLinkVerify: (body: {
    address: string;
    chainId: number;
    signature: string;
  }): Promise<AxiosResponse<WalletLinkVerifyResponse>> => api.post('/wallet/link/verify', body),
  deleteWalletLink: (): Promise<AxiosResponse<{ ok: boolean; message?: string }>> =>
    api.delete('/wallet/link'),
  getBalance: (): Promise<AxiosResponse<WalletBalanceResponse>> => api.get('/wallet/balance'),
  getTransactions: (): Promise<AxiosResponse<WalletTransactionsResponse>> => api.get('/wallet/transactions'),
  getDepositPending: (): Promise<AxiosResponse<WalletPendingDepositsResponse>> => api.get('/wallet/deposit/pending'),
  getHdAddress: (): Promise<AxiosResponse<WalletHdAddressResponse>> => api.get('/wallet/deposit/hd-address'),
  postDepositEstimateGas: (
    body: Record<string, unknown>,
  ): Promise<AxiosResponse<WalletDepositGasEstimateResponse>> => api.post('/wallet/deposit/estimate-gas', body),
  postDepositSubmit: (body: Record<string, unknown>): Promise<AxiosResponse<WalletDepositSubmitResponse>> =>
    api.post('/wallet/deposit/submit', body),
  postBtcpayInvoice: (body: Record<string, unknown>): Promise<AxiosResponse<WalletBtcpayInvoicePostResponse>> =>
    api.post('/wallet/btcpay/invoice', body),
  getBtcpayInvoiceStatus: (invoiceId: string): Promise<AxiosResponse<WalletBtcpayInvoicePollResponse>> =>
    api.get(`/wallet/btcpay/invoice/${encodeURIComponent(invoiceId)}`),
  postWithdraw: (body: WalletWithdrawRequestBody): Promise<AxiosResponse<WalletWithdrawResponse>> =>
    api.post('/wallet/withdraw', body),
  getDepositTickets: (): Promise<AxiosResponse<WalletDepositTicketsResponse>> => api.get('/deposit-tickets'),
  postDepositTicket: (body: Record<string, unknown>): Promise<AxiosResponse<WalletDepositTicketPostResponse>> =>
    api.post('/deposit-tickets', body),
};
