import type { ChainConfig } from "./_types.js";

/**
 * Avalanche C-Chain (chainId 43114).
 * Uniswap V3 is deployed here with a different NFPM/Factory than on Ethereum.
 */
const avalanche: ChainConfig = {
  chainId: 43114,
  name: "avalanche",
  nativeSymbol: "AVAX",
  nativePriceKey: "avax",
  explorerBase: "https://snowtrace.io",
  fetchNfts: false,
  rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
  uniV3NfpmAddress:    "0x655C406EBFa14EE2006250925e54ec43AD184f8B",
  uniV3FactoryAddress: "0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD",
  knownTokens: [
    { contractAddress: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", symbol: "USDC",   name: "USD Coin",      decimals: 6,  priceKey: "stable" },
    { contractAddress: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", symbol: "USDT",   name: "Tether USD",    decimals: 6,  priceKey: "stable" },
    { contractAddress: "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab", symbol: "WETH.e", name: "Wrapped Ether", decimals: 18, priceKey: "eth"    },
    { contractAddress: "0x50b7545627a5162f82a992c33b87adc75187b218", symbol: "WBTC.e", name: "Wrapped BTC",   decimals: 8,  priceKey: "btc"    },
  ],
};

export default avalanche;
