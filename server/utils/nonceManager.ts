const nonceState = new Map<
  string,
  {
    nextNonce: bigint;
  }
>();

function keyFor(chainId: unknown, address: unknown): string {
  return `${Number(chainId)}:${String(address || "").toLowerCase()}`;
}

export type ResetNonceInput = {
  chainId: unknown;
  address: unknown;
};

export function resetNonce({ chainId, address }: ResetNonceInput): void {
  nonceState.delete(keyFor(chainId, address));
}

export type AllocateNonceInput = {
  chainId: unknown;
  address: unknown;
  getPendingNonce: () => Promise<bigint | number | string>;
};

/**
 * Allocates a unique nonce for an address within this Node.js process.
 *
 * This prevents duplicate nonces when broadcasting multiple txs in a tight loop
 * (some RPCs lag and keep returning the same pending nonce).
 */
export async function allocateNonce({ chainId, address, getPendingNonce }: AllocateNonceInput): Promise<number> {
  if (!address) {
    throw new Error("Missing address");
  }

  const key = keyFor(chainId, address);

  const pendingNonceOnChain = BigInt(await getPendingNonce());
  const current = nonceState.get(key);

  let nextNonce = pendingNonceOnChain;
  if (current && typeof current.nextNonce === "bigint") {
    nextNonce = current.nextNonce > pendingNonceOnChain ? current.nextNonce : pendingNonceOnChain;
  }

  const allocated = nextNonce;
  nonceState.set(key, { nextNonce: nextNonce + 1n });

  return Number(allocated);
}
