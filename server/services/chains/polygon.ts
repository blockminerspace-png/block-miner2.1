import type { ChainConfig } from "./_types.js";

/**
 * Polygon PoS (chainId 137).
 * Primary chain for deposits. Scans NFTs via Etherscan.
 * Known tokens include BRLA (Brazilian Real stablecoin on Polygon)
 * and ATH (Aletheo), which have been used in active LP positions.
 */
const polygon: ChainConfig = {
  chainId: 137,
  name: "polygon",
  nativeSymbol: "POL",
  nativePriceKey: "pol",
  explorerBase: "https://polygonscan.com",
  fetchNfts: true,
  rpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
  uniV3NfpmAddress:    "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  uniV3FactoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  knownTokens: [
    { contractAddress: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", symbol: "USDC",   name: "USD Coin",        decimals: 6,  priceKey: "stable" },
    { contractAddress: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", symbol: "USDC.e", name: "Bridged USDC",    decimals: 6,  priceKey: "stable" },
    { contractAddress: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", symbol: "USDT",   name: "Tether USD",      decimals: 6,  priceKey: "stable" },
    { contractAddress: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", symbol: "DAI",    name: "Dai Stablecoin",  decimals: 18, priceKey: "stable" },
    { contractAddress: "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", symbol: "WBTC",   name: "Wrapped BTC",     decimals: 8,  priceKey: "btc"    },
    { contractAddress: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", symbol: "WETH",   name: "Wrapped Ether",   decimals: 18, priceKey: "eth"    },
    // BRLA — Brazilian Digital Real (pegged to BRL; priceKey "brl" resolved via CoinGecko)
    { contractAddress: "0xe6a537a407488807f0bbebb93d5b0baa9b1f0c6e", symbol: "BRLA",   name: "BRL Analog",      decimals: 18, priceKey: "brl"    },
    // ATH — Aletheo governance token (community-priced via CoinGecko fallback)
    { contractAddress: "0x0df0f72ee0e5c9b7ca761ecec42754992b2da5bf", symbol: "ATH",    name: "Aletheo",         decimals: 18, priceKey: "stable" },
  ],
};

export default polygon;
