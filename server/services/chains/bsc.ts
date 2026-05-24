import type { ChainConfig } from "./_types.js";

/**
 * BNB Smart Chain (chainId 56).
 * Uses PancakeSwap V3 NFPM (dominant V3 DEX on BSC).
 * PancakeSwap V3 positions are ERC-721 compatible and use the same
 * positions()/balanceOf()/tokenOfOwnerByIndex() interface as Uniswap V3.
 */
const bsc: ChainConfig = {
  chainId: 56,
  name: "bsc",
  nativeSymbol: "BNB",
  nativePriceKey: "bnb",
  explorerBase: "https://bscscan.com",
  fetchNfts: false,
  rpcUrl: "https://bsc-dataseed.binance.org",
  uniV3NfpmAddress:    "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
  uniV3FactoryAddress: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
  knownTokens: [
    { contractAddress: "0x55d398326f99059ff775485246999027b3197955", symbol: "USDT",  name: "Tether USD",      decimals: 18, priceKey: "stable" },
    { contractAddress: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", symbol: "USDC",  name: "USD Coin",        decimals: 18, priceKey: "stable" },
    { contractAddress: "0xe9e7cea3dedca5984780bafc599bd69add087d56", symbol: "BUSD",  name: "Binance USD",     decimals: 18, priceKey: "stable" },
    { contractAddress: "0x2170ed0880ac9a755fd29b2688956bd959f933f8", symbol: "WETH",  name: "Wrapped Ether",   decimals: 18, priceKey: "eth"    },
    { contractAddress: "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", symbol: "BTCB",  name: "Bitcoin BEP2",    decimals: 18, priceKey: "btc"    },
    { contractAddress: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", symbol: "WBNB",  name: "Wrapped BNB",     decimals: 18, priceKey: "bnb"    },
  ],
};

export default bsc;
