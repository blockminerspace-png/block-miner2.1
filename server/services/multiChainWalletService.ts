/**
 * Multi-chain wallet snapshot service.
 *
 * Fetches native balances + ERC-20 token holdings + NFTs across
 * Ethereum, Polygon, Arbitrum, Base and Optimism for a single address.
 *
 * All Etherscan V2 calls share the global rate limiter so they never
 * contend with the HD scanner or deposits cron on the same API key.
 */
import { ethers } from "ethers";
import { etherscanRateLimitWait } from "../utils/etherscanRateLimiter.js";
import { getPolUsdPrice, getBtcUsdPrice, getEthUsdPrice } from "../utils/cryptoPrice.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChainTokenHolding = {
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: number;
  usdValue: number | null;
};

export type ChainNftHolding = {
  contractAddress: string;
  tokenId: string;
  contractName: string;
  tokenSymbol: string;
  standard: "ERC-721";
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  tokenUri: string | null;
  explorerUrl: string;
  openseaUrl: string;
};

export type ChainSnapshot = {
  chainId: number;
  name: string;
  nativeSymbol: string;
  nativeBalance: number;
  nativeUsd: number | null;
  tokens: ChainTokenHolding[];
  nfts: ChainNftHolding[];
  totalChainUsd: number | null;
};

export type MultiChainSnapshot = {
  address: string;
  fetchedAt: Date;
  totalUsd: number | null;
  valuePol: number | null;      // native POL on Polygon (kept for display compat)
  chains: ChainSnapshot[];
  tokens: ChainTokenHolding[];  // all tokens aggregated across chains
  nfts: ChainNftHolding[];      // all NFTs
};

// ─── Chain configuration ─────────────────────────────────────────────────────

type PriceKey = "stable" | "btc" | "eth" | "pol";

type KnownToken = {
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  priceKey: PriceKey;
};

type ChainConfig = {
  chainId: number;
  name: string;
  nativeSymbol: string;
  nativePriceKey: "eth" | "pol";
  explorerBase: string;
  knownTokens: readonly KnownToken[];
  fetchNfts: boolean;
  rpcUrl: string;
};

const CHAINS: ChainConfig[] = [
  {
    chainId: 1,
    name: "ethereum",
    nativeSymbol: "ETH",
    nativePriceKey: "eth",
    explorerBase: "https://etherscan.io",
    fetchNfts: false,
    rpcUrl: "https://eth.llamarpc.com",
    knownTokens: [
      { contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", symbol: "USDC",  name: "USD Coin",      decimals: 6,  priceKey: "stable" },
      { contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7", symbol: "USDT",  name: "Tether USD",    decimals: 6,  priceKey: "stable" },
      { contractAddress: "0x6b175474e89094c44da98b954eedeac495271d0f", symbol: "DAI",   name: "Dai",           decimals: 18, priceKey: "stable" },
      { contractAddress: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", symbol: "WBTC",  name: "Wrapped BTC",   decimals: 8,  priceKey: "btc"    },
      { contractAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", symbol: "WETH",  name: "Wrapped Ether", decimals: 18, priceKey: "eth"    },
    ],
  },
  {
    chainId: 137,
    name: "polygon",
    nativeSymbol: "POL",
    nativePriceKey: "pol",
    explorerBase: "https://polygonscan.com",
    fetchNfts: true,
    rpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
    knownTokens: [
      { contractAddress: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", symbol: "USDC",   name: "USD Coin",        decimals: 6,  priceKey: "stable" },
      { contractAddress: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", symbol: "USDC.e", name: "Bridged USDC",    decimals: 6,  priceKey: "stable" },
      { contractAddress: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", symbol: "USDT",   name: "Tether USD",      decimals: 6,  priceKey: "stable" },
      { contractAddress: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", symbol: "DAI",    name: "Dai Stablecoin",  decimals: 18, priceKey: "stable" },
      { contractAddress: "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", symbol: "WBTC",   name: "Wrapped BTC",     decimals: 8,  priceKey: "btc"    },
      { contractAddress: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", symbol: "WETH",   name: "Wrapped Ether",   decimals: 18, priceKey: "eth"    },
    ],
  },
  {
    chainId: 42161,
    name: "arbitrum",
    nativeSymbol: "ETH",
    nativePriceKey: "eth",
    explorerBase: "https://arbiscan.io",
    fetchNfts: false,
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    knownTokens: [
      { contractAddress: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", symbol: "USDC",  name: "USD Coin",      decimals: 6,  priceKey: "stable" },
      { contractAddress: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", symbol: "USDT",  name: "Tether USD",    decimals: 6,  priceKey: "stable" },
      { contractAddress: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", symbol: "WBTC",  name: "Wrapped BTC",   decimals: 8,  priceKey: "btc"    },
      { contractAddress: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", symbol: "WETH",  name: "Wrapped Ether", decimals: 18, priceKey: "eth"    },
    ],
  },
  {
    chainId: 8453,
    name: "base",
    nativeSymbol: "ETH",
    nativePriceKey: "eth",
    explorerBase: "https://basescan.org",
    fetchNfts: false,
    rpcUrl: "https://mainnet.base.org",
    knownTokens: [
      { contractAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC",  name: "USD Coin",      decimals: 6,  priceKey: "stable" },
      { contractAddress: "0x4200000000000000000000000000000000000006", symbol: "WETH",  name: "Wrapped Ether", decimals: 18, priceKey: "eth"    },
    ],
  },
  {
    chainId: 10,
    name: "optimism",
    nativeSymbol: "ETH",
    nativePriceKey: "eth",
    explorerBase: "https://optimistic.etherscan.io",
    fetchNfts: false,
    rpcUrl: "https://mainnet.optimism.io",
    knownTokens: [
      { contractAddress: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", symbol: "USDC",  name: "USD Coin",      decimals: 6,  priceKey: "stable" },
      { contractAddress: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", symbol: "USDT",  name: "Tether USD",    decimals: 6,  priceKey: "stable" },
      { contractAddress: "0x4200000000000000000000000000000000000006", symbol: "WETH",  name: "Wrapped Ether", decimals: 18, priceKey: "eth"    },
    ],
  },
];

// ─── Etherscan V2 helper (chainId-aware) ─────────────────────────────────────

const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";

function getApiKey(): string {
  return String(process.env.POLYGONSCAN_API_KEY || "").trim();
}

async function escanFetch(chainId: number, params: Record<string, unknown>) {
  await etherscanRateLimitWait();
  const apiKey = getApiKey();
  const url = new URL(ETHERSCAN_V2_BASE);
  url.searchParams.set("chainid", String(chainId));
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    url.searchParams.set(k, String(v));
  }
  if (apiKey) url.searchParams.set("apikey", apiKey);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
  return res.json() as Promise<{ message?: string; result?: unknown }>;
}

// ─── Price helpers ───────────────────────────────────────────────────────────

type Prices = { eth: number | null; pol: number | null; btc: number | null };

function tokenUsd(balance: number, priceKey: PriceKey, prices: Prices): number | null {
  if (priceKey === "stable") return balance;
  if (priceKey === "btc")    return prices.btc != null ? balance * prices.btc : null;
  if (priceKey === "eth")    return prices.eth != null ? balance * prices.eth : null;
  if (priceKey === "pol")    return prices.pol != null ? balance * prices.pol : null;
  return null;
}

async function fetchCoinGeckoBatch(contractAddresses: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (!contractAddresses.length) return prices;
  try {
    const addrs = contractAddresses.map(a => a.toLowerCase()).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/polygon-pos?contract_addresses=${addrs}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(12_000) },
    );
    if (!res.ok) return prices;
    const json = (await res.json()) as Record<string, { usd?: number }>;
    for (const [addr, data] of Object.entries(json)) {
      const p = data?.usd;
      if (p != null && Number.isFinite(p) && p > 0) prices.set(addr.toLowerCase(), p);
    }
  } catch { /* ignore */ }
  return prices;
}

// ─── Per-chain fetch ─────────────────────────────────────────────────────────

async function fetchNativeBalance(chainId: number, address: string): Promise<bigint> {
  try {
    const json = await escanFetch(chainId, { module: "account", action: "balance", address, tag: "latest" });
    return BigInt(String(json?.result ?? "0"));
  } catch { return 0n; }
}

async function fetchTokenBalance(chainId: number, address: string, contractAddress: string): Promise<bigint> {
  try {
    const json = await escanFetch(chainId, {
      module: "account", action: "tokenbalance",
      contractaddress: contractAddress, address, tag: "latest",
    });
    return BigInt(String(json?.result ?? "0"));
  } catch { return 0n; }
}

async function fetchTokenTxHistory(chainId: number, address: string, maxPages = 10) {
  const pageSize = 100;
  const rows: unknown[] = [];
  for (let page = 1; page <= maxPages; page++) {
    try {
      const json = await escanFetch(chainId, {
        module: "account", action: "tokentx",
        address, startblock: 0, endblock: 99999999,
        page, offset: pageSize, sort: "asc",
      });
      const list = json?.result;
      if (!Array.isArray(list) || !list.length) break;
      rows.push(...list);
      if (list.length < pageSize) break;
    } catch { break; }
  }
  return rows;
}

async function fetchNftTxHistory(chainId: number, address: string, maxPages = 50) {
  const pageSize = 100;
  const rows: unknown[] = [];
  for (let page = 1; page <= maxPages; page++) {
    try {
      const json = await escanFetch(chainId, {
        module: "account", action: "tokennfttx",
        address, startblock: 0, endblock: 99999999,
        page, offset: pageSize, sort: "asc",
      });
      const list = json?.result;
      if (!Array.isArray(list) || !list.length) break;
      rows.push(...list);
      if (list.length < pageSize) break;
    } catch { break; }
  }
  return rows;
}

// ─── NFT metadata ────────────────────────────────────────────────────────────

const ERC721_ABI = ["function tokenURI(uint256 tokenId) view returns (string)"];

function resolveIpfs(uri: string): string {
  return uri.startsWith("ipfs://") ? "https://ipfs.io/ipfs/" + uri.slice(7) : uri;
}

function parseInlineMeta(uri: string): { name?: string; description?: string; image?: string } | null {
  try {
    if (uri.startsWith("data:application/json;base64,"))
      return JSON.parse(Buffer.from(uri.slice(29), "base64").toString("utf8"));
    if (uri.startsWith("data:application/json,"))
      return JSON.parse(decodeURIComponent(uri.slice(22)));
  } catch { /* ignore */ }
  return null;
}

async function fetchNftMeta(uri: string): Promise<{ name?: string; description?: string; image?: string } | null> {
  const inline = parseInlineMeta(uri);
  if (inline) return inline;
  const url = resolveIpfs(uri);
  if (!url.startsWith("http")) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function resolveNfts(address: string, rpcUrl: string, explorerBase: string, nftRows: unknown[]): Promise<ChainNftHolding[]> {
  if (!nftRows.length) return [];
  const addr = address.toLowerCase();

  type Row = { from?: string; to?: string; contractAddress?: string; tokenID?: string; tokenName?: string; tokenSymbol?: string; timeStamp?: string };
  const held = new Map<string, { contractAddress: string; tokenId: string; contractName: string; tokenSymbol: string }>();

  const sorted = (nftRows as Row[]).sort((a, b) => Number(a.timeStamp || 0) - Number(b.timeStamp || 0));
  for (const t of sorted) {
    const from = String(t.from || "").toLowerCase();
    const to   = String(t.to   || "").toLowerCase();
    const ca   = String(t.contractAddress || "").toLowerCase();
    const tid  = String(t.tokenID || "");
    const key  = `${ca}:${tid}`;
    if (to === addr) held.set(key, { contractAddress: ca, tokenId: tid, contractName: String(t.tokenName || ""), tokenSymbol: String(t.tokenSymbol || "") });
    else if (from === addr) held.delete(key);
  }

  if (!held.size) return [];

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return Promise.all(
    Array.from(held.values()).map(async (info): Promise<ChainNftHolding> => {
      const base: ChainNftHolding = {
        contractAddress: info.contractAddress,
        tokenId:         info.tokenId,
        contractName:    info.contractName,
        tokenSymbol:     info.tokenSymbol,
        standard:        "ERC-721",
        name:            null,
        description:     null,
        imageUrl:        null,
        tokenUri:        null,
        explorerUrl:     `${explorerBase}/token/${info.contractAddress}?a=${info.tokenId}`,
        openseaUrl:      `https://opensea.io/assets/matic/${info.contractAddress}/${info.tokenId}`,
      };
      try {
        const contract = new ethers.Contract(info.contractAddress, ERC721_ABI, provider);
        const uri: string = await Promise.race([
          contract.tokenURI(BigInt(info.tokenId)) as Promise<string>,
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8_000)),
        ]);
        base.tokenUri = uri;
        const meta = await fetchNftMeta(uri);
        if (meta) {
          base.name        = meta.name        ?? null;
          base.description = meta.description ?? null;
          if (meta.image)  base.imageUrl = resolveIpfs(meta.image);
        }
      } catch { /* tokenURI not available */ }
      return base;
    }),
  );
}

// ─── Single-chain snapshot ───────────────────────────────────────────────────

async function fetchChainSnapshot(
  chain: ChainConfig,
  address: string,
  prices: Prices,
): Promise<ChainSnapshot> {
  // 1. Native balance
  const nativeWei  = await fetchNativeBalance(chain.chainId, address);
  const nativeBal  = Number(ethers.formatEther(nativeWei));
  const nativeUsd  = tokenUsd(nativeBal, chain.nativePriceKey, prices);

  // 2. Known token balances
  const knownByAddr = new Map(chain.knownTokens.map(t => [t.contractAddress.toLowerCase(), t]));
  const tokenHoldings: ChainTokenHolding[] = [];

  // For Polygon: also discover via tokentx history
  const metaMap = new Map<string, { symbol: string; name: string; decimals: number }>();
  if (chain.chainId === 137) {
    const history = await fetchTokenTxHistory(chain.chainId, address, 10);
    type TxMeta = { contractAddress?: string; tokenSymbol?: string; tokenName?: string; tokenDecimal?: string };
    for (const tx of history) {
      const t = tx as TxMeta;
      if (!t.contractAddress) continue;
      const ca = t.contractAddress.toLowerCase();
      if (!metaMap.has(ca)) {
        metaMap.set(ca, {
          symbol:   String(t.tokenSymbol   || ""),
          name:     String(t.tokenName     || ""),
          decimals: Math.max(0, Math.min(36, Number(t.tokenDecimal || "18") || 18)),
        });
      }
    }
  }

  // Seed known tokens into metaMap
  for (const kt of chain.knownTokens) {
    const ca = kt.contractAddress.toLowerCase();
    if (!metaMap.has(ca)) metaMap.set(ca, { symbol: kt.symbol, name: kt.name, decimals: kt.decimals });
  }

  const contractsToCheck = Array.from(metaMap.keys());
  const withBalance: { contractAddress: string; rawBalance: bigint }[] = [];
  for (const ca of contractsToCheck) {
    const raw = await fetchTokenBalance(chain.chainId, address, ca);
    if (raw > 0n) withBalance.push({ contractAddress: ca, rawBalance: raw });
  }

  // Batch-price unknown tokens via CoinGecko (Polygon only for now)
  const unknownAddrs = withBalance.map(r => r.contractAddress).filter(ca => !knownByAddr.has(ca));
  const cgPrices = chain.chainId === 137 ? await fetchCoinGeckoBatch(unknownAddrs) : new Map<string, number>();

  for (const { contractAddress, rawBalance } of withBalance) {
    const meta    = metaMap.get(contractAddress) ?? { symbol: "?", name: "", decimals: 18 };
    const known   = knownByAddr.get(contractAddress);
    const balance = Number(ethers.formatUnits(rawBalance, meta.decimals));
    let usdValue: number | null = null;
    if (known) {
      usdValue = tokenUsd(balance, known.priceKey, prices);
    } else {
      const cgp = cgPrices.get(contractAddress);
      if (cgp != null) usdValue = balance * cgp;
    }
    tokenHoldings.push({ contractAddress, symbol: meta.symbol, name: meta.name, decimals: meta.decimals, balance, usdValue });
  }

  tokenHoldings.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));

  // 3. NFTs (only for chains configured to fetch them)
  let nfts: ChainNftHolding[] = [];
  if (chain.fetchNfts) {
    const nftRows = await fetchNftTxHistory(chain.chainId, address);
    nfts = await resolveNfts(address, chain.rpcUrl, chain.explorerBase, nftRows);
  }

  const tokensUsd  = tokenHoldings.reduce((s, t) => s + (t.usdValue ?? 0), 0);
  const totalChainUsd = nativeUsd != null ? nativeUsd + tokensUsd : tokensUsd || null;

  return { chainId: chain.chainId, name: chain.name, nativeSymbol: chain.nativeSymbol, nativeBalance: nativeBal, nativeUsd, tokens: tokenHoldings, nfts, totalChainUsd };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchMultiChainSnapshot(address: string): Promise<MultiChainSnapshot> {
  const [ethPrice, polPrice, btcPrice] = await Promise.all([
    getEthUsdPrice().catch((): number | null => null),
    getPolUsdPrice().catch((): number | null => null),
    getBtcUsdPrice().catch((): number | null => null),
  ]);
  const prices: Prices = { eth: ethPrice, pol: polPrice, btc: btcPrice };

  const chainSnapshots: ChainSnapshot[] = [];
  for (const chain of CHAINS) {
    try {
      const snap = await fetchChainSnapshot(chain, address, prices);
      // Only include chains where the wallet has any balance
      if (snap.nativeBalance > 0 || snap.tokens.length > 0 || snap.nfts.length > 0) {
        chainSnapshots.push(snap);
      }
    } catch (err) {
      console.warn(`[multi-chain] chain ${chain.name} failed for ${address}:`, (err as Error)?.message);
    }
  }

  const totalUsd   = chainSnapshots.reduce((s, c) => s + (c.totalChainUsd ?? 0), 0) || null;
  const polySnap   = chainSnapshots.find(c => c.chainId === 137);
  const valuePol   = polySnap?.nativeBalance ?? null;

  // Aggregate tokens across all chains (de-duplicate by symbol if same price)
  const allTokens  = chainSnapshots.flatMap(c => c.tokens.map(t => ({ ...t, chain: c.name })));
  const allNfts    = chainSnapshots.flatMap(c => c.nfts);

  return { address, fetchedAt: new Date(), totalUsd, valuePol, chains: chainSnapshots, tokens: allTokens, nfts: allNfts };
}
