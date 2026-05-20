export class InjectedWalletError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'InjectedWalletError';
    this.code = code;
  }
}

export const INJECTED_WALLET_ERROR_CODES = {
  NO_PROVIDER: 'NO_PROVIDER',
  USER_REJECTED: 'USER_REJECTED',
  CONNECT_FAILED: 'CONNECT_FAILED',
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  INVALID_CHAIN: 'INVALID_CHAIN',
} as const;
