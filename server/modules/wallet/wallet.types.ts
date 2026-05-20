export const WITHDRAW_MIN_POL = 0.01;
export const WITHDRAW_PROCESSING_HOURS = 24;

export const VALID_MINING_PAYOUT_MODES = new Set(["pol"]);

export const WALLET_LINK_CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const WALLET_LINK_CALLBACK_TYPE = "WALLET_LINK_CHALLENGE";
export const WALLET_LINK_ALLOWED_CHAIN_IDS = new Set([137]);

export type SavedWalletDto = {
  address: string;
  chainId: number | null;
  verifiedAt: string | null;
};

export type WalletLinkChallengeRow = {
  id: number;
  message: string;
  nonce: string;
  address: string;
  chainId: number;
  expiresAtMs: number;
};
