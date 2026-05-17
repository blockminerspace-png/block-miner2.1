/** Must match server `WITHDRAW_MIN_POL` (see `server/modules/wallet/wallet.types.ts`). */
export const WALLET_MIN_WITHDRAW_POL = 10;

const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;

export function isValidPolygonWithdrawAddress(addr: string): boolean {
  return EVM_ADDR.test(addr.trim());
}
