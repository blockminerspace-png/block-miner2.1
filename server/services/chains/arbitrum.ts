import type { ChainConfig } from "./_types.js";

const arbitrum: ChainConfig = {
  chainId: 42161,
  name: "arbitrum",
  nativeSymbol: "ETH",
  nativePriceKey: "eth",
  explorerBase: "https://arbiscan.io",
  fetchNfts: false,
  rpcUrl: "https://arb1.arbitrum.io/rpc",
  uniV3NfpmAddress:    "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  uniV3FactoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  knownTokens: [
    { contractAddress: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", symbol: "USDC",  name: "USD Coin",      decimals: 6,  priceKey: "stable" },
    { contractAddress: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", symbol: "USDT",  name: "Tether USD",    decimals: 6,  priceKey: "stable" },
    { contractAddress: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", symbol: "WBTC",  name: "Wrapped BTC",   decimals: 8,  priceKey: "btc"    },
    { contractAddress: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", symbol: "WETH",  name: "Wrapped Ether", decimals: 18, priceKey: "eth"    },
    // ATH on Arbitrum
    { contractAddress: "0x0e1a9f3e91aa540a154cfa75a2c6e1e4f1ad8de3", symbol: "ATH",   name: "Aletheo",       decimals: 18, priceKey: "stable" },
  ],
};

export default arbitrum;
