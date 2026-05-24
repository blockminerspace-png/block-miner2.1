/**
 * Shared types for per-chain configuration.
 * Each chain has its own file in this directory; this file only defines types.
 */

/** Price keys supported by the base-price fetch (fetchAllBasePrices). */
export type PriceKey = "stable" | "btc" | "eth" | "pol" | "bnb" | "avax" | "brl";

export type KnownToken = {
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  priceKey: PriceKey;
};

export type ChainConfig = {
  chainId: number;
  name: string;
  nativeSymbol: string;
  nativePriceKey: PriceKey;
  explorerBase: string;
  knownTokens: readonly KnownToken[];
  fetchNfts: boolean;
  rpcUrl: string;
  /** Uniswap V3 (or compatible fork) NonfungiblePositionManager address. */
  uniV3NfpmAddress?: string;
  /** Uniswap V3 (or compatible fork) Factory address. */
  uniV3FactoryAddress?: string;
};
