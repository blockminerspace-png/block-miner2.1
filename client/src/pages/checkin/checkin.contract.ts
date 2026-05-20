import { encodeFunctionData, getAddress, isAddress, type Hex } from 'viem';
import type { CheckinStatusPayload } from '../../types/checkin';
import { weiHexFromDecimalString } from '../../shared/utils/checkinHelpers';
import { getBrowserEthereumProvider } from '../../shared/utils/walletProvider';
import {
  CheckinWalletError,
  ensureInjectedOnExpectedChain,
  getExpectedCheckinChainId,
  isWalletUserRejection,
} from './checkin.wallet';

export const CHECKIN_FUNCTION_ABI = [
  {
    type: 'function',
    name: 'checkIn',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
] as const;

export type CheckinContractResult = {
  txHash: `0x${string}`;
  walletAddress: `0x${string}`;
  chainId: number;
};

export type CheckinPaymentTarget =
  | { mode: 'contract'; address: `0x${string}`; amountWei: bigint }
  | { mode: 'treasury'; address: `0x${string}`; amountWei: bigint };

export function resolveCheckinContractAddressFromEnv(): `0x${string}` | null {
  const raw = String(import.meta.env.VITE_CHECKIN_CONTRACT_ADDRESS ?? '').trim();
  if (!isAddress(raw)) return null;
  return getAddress(raw);
}

export function resolveCheckinPaymentTarget(status: CheckinStatusPayload): CheckinPaymentTarget | null {
  const amountRaw = status.checkinAmountWei;
  if (!amountRaw) return null;
  let amountWei: bigint;
  try {
    amountWei = BigInt(amountRaw);
  } catch {
    return null;
  }
  if (amountWei <= 0n) return null;

  const fromStatus =
    status.checkinContractAddress && isAddress(status.checkinContractAddress)
      ? getAddress(status.checkinContractAddress)
      : null;
  const contract = resolveCheckinContractAddressFromEnv() ?? fromStatus;
  if (contract) {
    return { mode: 'contract', address: contract, amountWei };
  }

  if (status.checkinReceiver && isAddress(status.checkinReceiver)) {
    return { mode: 'treasury', address: getAddress(status.checkinReceiver), amountWei };
  }
  return null;
}

function assertTxHash(value: unknown): `0x${string}` {
  if (typeof value !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(value.trim())) {
    throw new CheckinWalletError('TX_HASH_MISSING', 'Wallet did not return a transaction hash.');
  }
  return value.trim() as `0x${string}`;
}

export async function sendCheckinTransaction(
  status: CheckinStatusPayload,
): Promise<CheckinContractResult> {
  const target = resolveCheckinPaymentTarget(status);
  if (!target) {
    throw new CheckinWalletError('PAYMENT_NOT_CONFIGURED', 'Check-in payment is not configured.');
  }

  const expectedChainId = getExpectedCheckinChainId();
  const account = await ensureInjectedOnExpectedChain(expectedChainId);

  const provider = getBrowserEthereumProvider();
  if (!provider) {
    throw new CheckinWalletError(
      'NO_INJECTED_WALLET',
      'Open this page in a browser with a Web3 wallet or install MetaMask, Rabby, or Brave Wallet.',
    );
  }

  const valueHex = weiHexFromDecimalString(target.amountWei.toString());
  if (typeof valueHex !== 'string' || !valueHex.startsWith('0x')) {
    throw new CheckinWalletError('INVALID_AMOUNT', 'Invalid check-in payment amount.');
  }

  const baseTx = {
    from: account.address,
    value: valueHex as Hex,
  };

  const txRequest =
    target.mode === 'contract'
      ? {
          ...baseTx,
          to: target.address,
          data: encodeFunctionData({
            abi: CHECKIN_FUNCTION_ABI,
            functionName: 'checkIn',
          }),
        }
      : {
          ...baseTx,
          to: target.address,
        };

  let txHash: unknown;
  try {
    txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [txRequest],
    });
  } catch (err: unknown) {
    if (isWalletUserRejection(err)) {
      throw new CheckinWalletError('USER_REJECTED', 'Transaction cancelled by user.');
    }
    throw err;
  }

  return {
    txHash: assertTxHash(txHash),
    walletAddress: account.address,
    chainId: expectedChainId,
  };
}
