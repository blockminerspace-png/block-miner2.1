import { api } from '../../store/auth';

/** Cliente agrupado da Carteira — paths relativos a `/api` (axios baseURL). */
export const walletApi = {
  getPolUsd: () => api.get('/wallet/pol-usd'),
  getBalance: () => api.get('/wallet/balance'),
  getTransactions: () => api.get('/wallet/transactions'),
  getDepositPending: () => api.get('/wallet/deposit/pending'),
  getHdAddress: () => api.get('/wallet/deposit/hd-address'),
  postDepositEstimateGas: (body: unknown) => api.post('/wallet/deposit/estimate-gas', body),
  postDepositSubmit: (body: unknown) => api.post('/wallet/deposit/submit', body),
  postBtcpayInvoice: (body: unknown) => api.post('/wallet/btcpay/invoice', body),
  postWithdraw: (body: unknown) => api.post('/wallet/withdraw', body),
  getDepositTickets: () => api.get('/deposit-tickets'),
  postDepositTicket: (body: unknown) => api.post('/deposit-tickets', body),
};
