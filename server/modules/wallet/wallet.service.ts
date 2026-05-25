import crypto from "node:crypto";
import { getAddress, verifyMessage } from "ethers";
import walletModel from "../../models/walletModel.js";
import * as walletRepo from "./wallet.repository.js";
import {
  WITHDRAWAL_FEE_PERCENT,
  WITHDRAWAL_FEE_WAIVER_REQUIRED,
  countTodayOfferwallCompletions,
} from "./wallet.repository.js";
import { WALLET_ERROR } from "./wallet.errors.js";
import {
  WALLET_LINK_ALLOWED_CHAIN_IDS,
  WALLET_LINK_CHALLENGE_TTL_MS,
  type SavedWalletDto,
} from "./wallet.types.js";

export async function getWithdrawalFeeInfo(userId: number): Promise<{
  feePercent: number;
  feeWaived: boolean;
  completionsToday: number;
  requiredForWaiver: number;
}> {
  const completionsToday = await countTodayOfferwallCompletions(userId);
  return {
    feePercent: WITHDRAWAL_FEE_PERCENT,
    feeWaived: completionsToday >= WITHDRAWAL_FEE_WAIVER_REQUIRED,
    completionsToday,
    requiredForWaiver: WITHDRAWAL_FEE_WAIVER_REQUIRED,
  };
}

export async function submitWithdrawalRequest(userId: number, amountPol: number, destinationAddress: string) {
  const feeInfo = await getWithdrawalFeeInfo(userId);
  const feeAmount = feeInfo.feeWaived ? 0 : Math.round(amountPol * (feeInfo.feePercent / 100) * 1e8) / 1e8;
  return walletModel.createWithdrawal(userId, amountPol, destinationAddress, feeAmount);
}

function normalizeAddressInput(address: string): string {
  try {
    return getAddress(address.trim());
  } catch {
    throw Object.assign(new Error(WALLET_ERROR.INVALID_ADDRESS), { http: 400 });
  }
}

function assertAllowedChainId(chainId: number): void {
  if (!WALLET_LINK_ALLOWED_CHAIN_IDS.has(chainId)) {
    throw Object.assign(new Error(WALLET_ERROR.INVALID_CHAIN), { http: 400 });
  }
}

export async function getWalletMeForUser(userId: number): Promise<{ wallet: SavedWalletDto | null }> {
  const address = await walletRepo.getUserWalletAddress(userId);
  if (!address) {
    return { wallet: null };
  }
  return {
    wallet: {
      address,
      chainId: 137,
      verifiedAt: null,
    },
  };
}

export async function createWalletLinkChallengeForUser(
  userId: number,
  rawAddress: string,
  chainId: number,
): Promise<{ message: string }> {
  assertAllowedChainId(chainId);
  const address = normalizeAddressInput(rawAddress);
  const nonce = crypto.randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();
  const message = [
    "BlockMiner wallet link",
    `User: ${userId}`,
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `IssuedAt: ${issuedAt}`,
  ].join("\n");

  await walletRepo.createWalletLinkChallenge(
    userId,
    address,
    chainId,
    message,
    nonce,
    Date.now() + WALLET_LINK_CHALLENGE_TTL_MS,
  );

  return { message };
}

export async function verifyAndLinkWalletForUser(
  userId: number,
  rawAddress: string,
  chainId: number,
  signature: string,
): Promise<{ wallet: SavedWalletDto }> {
  assertAllowedChainId(chainId);
  const address = normalizeAddressInput(rawAddress);
  const addressLower = address.toLowerCase();

  const challenge = await walletRepo.findValidWalletLinkChallenge(userId, addressLower);
  if (!challenge) {
    throw Object.assign(new Error(WALLET_ERROR.CHALLENGE_NOT_FOUND), { http: 400 });
  }
  if (challenge.chainId !== chainId) {
    throw Object.assign(new Error(WALLET_ERROR.CHALLENGE_NOT_FOUND), { http: 400 });
  }

  let recovered: string;
  try {
    recovered = verifyMessage(challenge.message, signature);
  } catch {
    throw Object.assign(new Error(WALLET_ERROR.INVALID_SIGNATURE), { http: 401 });
  }

  if (recovered.toLowerCase() !== addressLower) {
    throw Object.assign(new Error(WALLET_ERROR.INVALID_SIGNATURE), { http: 401 });
  }

  await walletRepo.saveUserWallet(userId, address);
  await walletRepo.markWalletLinkChallengeUsed(challenge.id);
  await walletRepo.invalidateWalletLinkChallenges(userId, addressLower);

  const verifiedAt = new Date().toISOString();
  return {
    wallet: {
      address,
      chainId,
      verifiedAt,
    },
  };
}

/** Legacy one-step verify (same message format as older clients). */
export async function verifyLegacyWalletOwnership(
  userId: number,
  rawAddress: string,
  signature: string,
): Promise<{ wallet: SavedWalletDto }> {
  const address = normalizeAddressInput(rawAddress);
  const legacyMessage = `Verify wallet ownership for Block Miner: ${address}`;
  let recovered: string;
  try {
    recovered = verifyMessage(legacyMessage, signature);
  } catch {
    throw Object.assign(new Error(WALLET_ERROR.INVALID_SIGNATURE), { http: 401 });
  }
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    throw Object.assign(new Error(WALLET_ERROR.INVALID_SIGNATURE), { http: 401 });
  }
  await walletRepo.saveUserWallet(userId, address);
  return {
    wallet: {
      address,
      chainId: 137,
      verifiedAt: new Date().toISOString(),
    },
  };
}

export async function unlinkWalletForUser(userId: number): Promise<void> {
  await walletRepo.removeUserWallet(userId);
}
