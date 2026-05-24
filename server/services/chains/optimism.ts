import type { ChainConfig } from "./_types.js";

/**
 * Optimism (chainId 10) — OP Stack L2.
 * Uniswap V3 uses the same canonical NFPM as Ethereum/Polygon/Arbitrum.
 */
const optimism: ChainConfig = {
  chainId: 10,
  name: "optimism",
  nativeSymbol: "ETH",
  nativePriceKey: "eth",
  explorerBase: "https://optimistic.etherscan.io",
  fetchNfts: false,
  rpcUrl: "https://mainnet.optimism.io",
  uniV3NfpmAddress:    "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  uniV3FactoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  knownTokens: [
    { contractAddress: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", symbol: "USDC",  name: "USD Coin",      decimals: 6,  priceKey: "stable" },
    { contractAddress: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", symbol: "USDT",  name: "Tether USD",    decimals: 6,  priceKey: "stable" },
    { contractAddress: "0x4200000000000000000000000000000000000006", symbol: "WETH",  name: "Wrapped Ether", decimals: 18, priceKey: "eth"    },
    { contractAddress: "0x68f180fcce6836688e9084f035309e29bf0a2095", symbol: "WBTC",  name: "Wrapped BTC",   decimals: 8,  priceKey: "btc"    },
  ],
};

export default optimism;
