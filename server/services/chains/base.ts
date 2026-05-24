import type { ChainConfig } from "./_types.js";

/**
 * Base (chainId 8453) — OP Stack L2 by Coinbase.
 * Uses a separate Uniswap V3 NFPM deployment.
 * RPC via BlastAPI (reliable, no strict block-range limits for eth_getLogs).
 */
const base: ChainConfig = {
  chainId: 8453,
  name: "base",
  nativeSymbol: "ETH",
  nativePriceKey: "eth",
  explorerBase: "https://basescan.org",
  fetchNfts: false,
  rpcUrl: process.env.BASE_RPC_URL || "https://base-mainnet.public.blastapi.io",
  uniV3NfpmAddress:    "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1",
  uniV3FactoryAddress: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
  knownTokens: [
    { contractAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC",   name: "USD Coin",      decimals: 6,  priceKey: "stable" },
    { contractAddress: "0x4200000000000000000000000000000000000006", symbol: "WETH",   name: "Wrapped Ether", decimals: 18, priceKey: "eth"    },
    // cbBTC — Coinbase Wrapped BTC on Base
    { contractAddress: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", symbol: "cbBTC",  name: "Coinbase BTC",  decimals: 8,  priceKey: "btc"    },
    // FLOWER — community token used in active USDC/FLOWER LP
    { contractAddress: "0xd04383398dd2426297da660f9cca3d439af9ce1b", symbol: "FLOWER", name: "Flower",        decimals: 18, priceKey: "stable" },
  ],
};

export default base;
