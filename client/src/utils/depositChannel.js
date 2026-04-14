import { isAddress } from 'ethers';

/**
 * Injected (browser) deposit path: on-chain contract and/or treasury address.
 */
export function canUseInjectedDepositChannel(contractAddress, treasuryAddress) {
  const c = contractAddress && isAddress(String(contractAddress).trim());
  const t = treasuryAddress && isAddress(String(treasuryAddress).trim());
  return Boolean(c || t);
}
