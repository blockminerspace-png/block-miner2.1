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
  WalletPendingDepositsResponse,
  WalletPolUsdResponse,
  WalletTransactionsResponse,
  WalletWithdrawRequestBody,
  WalletWithdrawResponse,
} from './wallet.types';

/** Cliente da Carteira — paths relativos a `/api` (axios `baseURL`). */
export const walletApi = {
  getPolUsd: (): Promise<AxiosResponse<WalletPolUsdResponse>> => api.get('/wallet/pol-usd'),
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
