/** GET /api/wallet/balance — subset used by the dashboard (fields optional for defensive UI). */
export type WalletBalanceResponse = {
  ok: boolean;
  balance?: number;
  blkBalance?: number;
  blkLocked?: number;
  lifetimeMined?: number;
  totalWithdrawn?: number;
  walletAddress?: string | null;
  depositAddress?: string | null;
  depositContractAddress?: string | null;
  minDepositPol?: number;
  blockConfirmations?: number;
  depositVerifyMaxAttempts?: number;
  polygonHdDepositEnabled?: boolean;
  polygonHdDepositFeatureVisible?: boolean;
  polygonHdDepositMissingEnvKeys?: string[];
  polygonHdMinDepositPol?: number;
};

export type WalletTransactionRow = {
  type: string;
  amount: number | string;
  status: string;
  createdAt?: string;
  created_at?: string;
  txHash?: string | null;
};

export type WalletTransactionsResponse = {
  ok: boolean;
  transactions?: WalletTransactionRow[];
};

export type WalletPolUsdResponse = {
  ok: boolean;
  priceUsd?: number | null;
};

export type WalletWithdrawRequestBody = {
  amount: number;
  address: string;
  withdrawalCode?: string;
  withdrawalChallengeToken?: string;
};

export type WalletDepositGasEstimateResponse = {
  ok: boolean;
  gasLimit?: string;
  fallback?: boolean;
};

export type PendingDepositRow = {
  id: string | number;
  txHash?: string | null;
  status: string;
  verifyAttempts?: number;
  verifyMaxAttempts?: number;
  confirmationsCurrent?: number;
  confirmationsRequired?: number;
  txReverted?: boolean;
  txMined?: boolean;
  amount?: number | string;
  failReason?: string | null;
};

export type WalletPendingDepositsResponse = {
  ok: boolean;
  deposits?: PendingDepositRow[];
};

export type WalletHdAddressResponse = {
  ok: boolean;
  address?: string;
  message?: string;
  derivationIndex?: number;
  derivationPath?: string;
};

export type WalletDepositSubmitResponse = {
  ok: boolean;
  message?: string;
};

export type WalletWithdrawResponse = {
  ok: boolean;
  message?: string;
  require2FA?: boolean;
  withdrawalChallengeToken?: string;
  ttlMinutes?: number;
  reason?: string;
};

export type SavedWalletState = {
  walletAddress: `0x${string}` | null;
  chainId: number | null;
  verifiedAt: string | null;
};

export type ConnectedWalletState = {
  address: `0x${string}`;
  chainId: number;
  providerName: string;
} | null;

export type WalletMeResponse = {
  ok: boolean;
  wallet: {
    address: string;
    chainId: number | null;
    verifiedAt: string | null;
  } | null;
};

export type WalletLinkChallengeResponse = {
  ok: boolean;
  message?: string;
};

export type WalletLinkVerifyResponse = {
  ok: boolean;
  message?: string;
  wallet?: {
    address: string;
    chainId: number | null;
    verifiedAt: string | null;
  };
};
