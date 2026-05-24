/**
 * Multi-chain wallet snapshot service.
 *
 * Chain configurations live in ./chains/ (one file per network).
 * This service only contains the generic fetching + LP-valuation logic.
 * Failures on individual chains are isolated via Promise.allSettled.
 */
import { ethers } from "ethers";
import { etherscanRateLimitWait } from "../utils/etherscanRateLimiter.js";
import { CHAINS } from "./chains/index.js";
import type { ChainConfig, PriceKey } from "./chains/index.js";

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
  chainName?: string;
  chainId?: number;
  isLiquidityPosition?: boolean;
  liquidityUsd?: number | null;
  poolLabel?: string | null;
};

export type ChainSnapshot = {
  chainId: number;
  name: string;
  nativeSymbol: string;
  nativeBalance: number;
  nativeUsd: number | null;
  tokens: ChainTokenHolding[];
  nfts: ChainNftHolding[];
  lpUsd: number;
  totalChainUsd: number | null;
};

export type MultiChainSnapshot = {
  address: string;
  fetchedAt: Date;
  totalUsd: number | null;
  valuePol: number | null;
  chains: ChainSnapshot[];
  tokens: ChainTokenHolding[];
  nfts: ChainNftHolding[];
};

export type HistoricalLiquidityPoolPosition = ChainNftHolding & {
  status: "active" | "legacy";
};

type NftHistoryRow = {
  contractAddress?: string;
  tokenID?: string;
};

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

type Prices = { eth: number | null; pol: number | null; btc: number | null; bnb: number | null; avax: number | null; brl: number | null };

function tokenUsd(balance: number, priceKey: PriceKey, prices: Prices): number | null {
  if (priceKey === "stable") return balance;
  if (priceKey === "btc")    return prices.btc  != null ? balance * prices.btc  : null;
  if (priceKey === "eth")    return prices.eth  != null ? balance * prices.eth  : null;
  if (priceKey === "pol")    return prices.pol  != null ? balance * prices.pol  : null;
  if (priceKey === "bnb")    return prices.bnb  != null ? balance * prices.bnb  : null;
  if (priceKey === "brl")    return prices.brl  != null ? balance * prices.brl  : null;
  if (priceKey === "avax")   return prices.avax != null ? balance * prices.avax : null;
  return null;
}

async function fetchCoinGeckoBatchFor(contractAddresses: string[], network: string): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (!contractAddresses.length) return prices;
  try {
    const addrs = contractAddresses.map(a => a.toLowerCase()).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/${network}?contract_addresses=${addrs}&vs_currencies=usd`,
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

const ERC20_ABI_BALANCE = ["function balanceOf(address owner) view returns (uint256)"];

/** Fetch native balance via RPC (reliable, no API-key restriction). */
async function fetchNativeBalanceRpc(rpcUrl: string, address: string): Promise<bigint> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    return BigInt((await provider.getBalance(address)).toString());
  } catch { return 0n; }
}

/** Fetch ERC-20 token balance via RPC eth_call (no API-key restriction). */
async function fetchTokenBalanceRpc(rpcUrl: string, tokenAddress: string, walletAddress: string): Promise<bigint> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI_BALANCE, provider);
    const raw = await (contract.balanceOf(walletAddress) as Promise<bigint>);
    return raw;
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

async function fetchNftTxHistory(chainId: number, address: string, maxPages = 50, contractAddress?: string) {
  const pageSize = 100;
  const rows: unknown[] = [];
  for (let page = 1; page <= maxPages; page++) {
    try {
      const json = await escanFetch(chainId, {
        module: "account", action: "tokennfttx",
        address,
        ...(contractAddress ? { contractaddress: contractAddress } : {}),
        startblock: 0, endblock: 99999999,
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

function resolveNftImageUri(uri: string): string {
  if (uri.startsWith("data:image/")) return uri;
  return resolveIpfs(uri);
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

async function fetchErc721TokenUri(
  provider: ethers.JsonRpcProvider,
  contractAddress: string,
  tokenId: bigint,
): Promise<string | null> {
  try {
    const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
    const uri: string = await Promise.race([
      contract.tokenURI(tokenId) as Promise<string>,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8_000)),
    ]);
    return uri;
  } catch {
    return null;
  }
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
          if (meta.image)  base.imageUrl = resolveNftImageUri(meta.image);
        }
      } catch { /* tokenURI not available */ }
      return base;
    }),
  );
}

// ─── Uniswap V3 LP position tracking ─────────────────────────────────────────

const NFPM_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function ownerOf(uint256 tokenId) view returns (address)",
];

const POOL_SLOT0_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
];

const FACTORY_GETPOOL_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
];

const ERC20_META_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const ERC721_TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

const STABLE_SYMS = new Set(["USDC", "USDT", "DAI", "BUSD", "FRAX", "LUSD", "USDC.E", "BRIDGED USDC"]);

function knownPriceBySymbol(sym: string, prices: Prices): number | null {
  const s = sym.toUpperCase();
  if (STABLE_SYMS.has(s))                               return 1;
  if (["ETH", "WETH"].includes(s))                      return prices.eth;
  if (["BTC", "WBTC", "BTCB", "CBBTC"].includes(s))    return prices.btc;
  if (["POL", "MATIC", "WPOL"].includes(s))             return prices.pol;
  if (["BNB", "WBNB"].includes(s))                      return prices.bnb;
  if (["AVAX", "WAVAX"].includes(s))                    return prices.avax;
  if (["BRLA", "BRL"].includes(s))                      return prices.brl;
  return null;
}

/**
 * Calculate token amounts held in a Uniswap V3 position.
 * Uses floating-point for simplicity (±0.1% accuracy is fine for USD display).
 * Amounts are in ATOMIC units.
 */
function calcUniV3Amounts(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  liquidity: bigint,
): { amount0: number; amount1: number } {
  if (liquidity === 0n) return { amount0: 0, amount1: 0 };
  const L = Number(liquidity);
  const Q96 = 2 ** 96;
  const sqrtP  = Number(sqrtPriceX96) / Q96;
  const sqrtPa = Math.pow(1.0001, tickLower / 2);
  const sqrtPb = Math.pow(1.0001, tickUpper / 2);

  if (sqrtP <= sqrtPa) {
    // Below range — all in token0
    return { amount0: L * (1 / sqrtPa - 1 / sqrtPb), amount1: 0 };
  } else if (sqrtP >= sqrtPb) {
    // Above range — all in token1
    return { amount0: 0, amount1: L * (sqrtPb - sqrtPa) };
  }
  // In range
  return {
    amount0: L * (1 / sqrtP - 1 / sqrtPb),
    amount1: L * (sqrtP - sqrtPa),
  };
}

/**
 * Fetch total USD value of all Uniswap V3 positions associated with a wallet on one chain.
 *
 * Strategy:
 *  1. Use provider.call() (raw eth_call) for all contract reads — avoids ethers.js
 *     Contract wrapper quirks where tokenOfOwnerByIndex can return stale/bad data.
 *  2. Enumerate token IDs via chunked Transfer(→wallet) logs so we capture staked
 *     positions (wallet is beneficial owner but not direct ERC-721 holder).
 *  3. For each token ID, call positions() directly; if liquidity or fees > 0, value it.
 */
async function fetchUniV3LpValue(
  rpcUrl: string,
  walletAddress: string,
  nfpmAddress: string,
  factoryAddress: string,
  prices: Prices,
  chain: Pick<ChainConfig, "chainId" | "name" | "explorerBase">,
): Promise<{ totalUsd: number; nftPositions: ChainNftHolding[] }> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Build interface objects for ABI encoding/decoding
  const nfpmIface    = new ethers.Interface(NFPM_ABI);
  const poolIface    = new ethers.Interface(POOL_SLOT0_ABI);
  const factoryIface = new ethers.Interface(FACTORY_GETPOOL_ABI);
  const erc20Iface   = new ethers.Interface(ERC20_META_ABI);

  // Helper: direct eth_call via provider.call() — no gas estimation, no wrapping quirks
  const call = async (to: string, iface: ethers.Interface, fn: string, args: unknown[]): Promise<ethers.Result> => {
    const data   = iface.encodeFunctionData(fn, args);
    const raw    = await provider.call({ to, data });
    return iface.decodeFunctionResult(fn, raw);
  };

  // ─── Quick balance check ──────────────────────────────────────────────────
  let nftCount = 0n;
  try {
    const [bal] = await call(nfpmAddress, nfpmIface, "balanceOf", [walletAddress]);
    nftCount = BigInt(bal.toString());
    console.log(`[uniV3-lp] NFPM=${nfpmAddress.slice(0,10)}… balanceOf → ${nftCount}`);
  } catch (err) {
    console.warn(`[uniV3-lp] balanceOf failed (${nfpmAddress.slice(0,10)}…):`, (err as Error)?.message?.slice(0, 80));
    return { totalUsd: 0, nftPositions: [] };
  }
  if (nftCount === 0n) return { totalUsd: 0, nftPositions: [] };

  // ─── Enumerate token IDs via tokenOfOwnerByIndex (direct provider.call) ──
  // The ethers.js Contract wrapper has quirks on Base; provider.call() works reliably.
  // Note: some IDs may be stale (burned positions) — those fail at positions() and are skipped.
  // Staked positions are still in the enumerable list and positions() succeeds for them.
  const tokenIdResults = await Promise.all(
    Array.from({ length: Number(nftCount) }, (_, i) =>
      call(nfpmAddress, nfpmIface, "tokenOfOwnerByIndex", [walletAddress, BigInt(i)])
        .then(([tid]) => BigInt(tid.toString()))
        .catch((err: unknown) => {
          console.warn(`[uniV3-lp] tokenOfOwnerByIndex(${i}) failed:`, String((err as Error)?.message).slice(0, 60));
          return null;
        }),
    ),
  );
  const tokenIds = tokenIdResults.filter((tid): tid is bigint => tid !== null);
  console.log(`[uniV3-lp] NFPM=${nfpmAddress.slice(0,10)}… scanning ${tokenIds.length} position(s)`);

  // ─── Value each position ──────────────────────────────────────────────────
  let totalUsd = 0;
  const nftPositions: ChainNftHolding[] = [];
  for (const tokenId of tokenIds) {
    try {
      const posResult = await call(nfpmAddress, nfpmIface, "positions", [tokenId]);
      const token0    = String(posResult[2]);
      const token1    = String(posResult[3]);
      const fee       = BigInt(posResult[4].toString());
      const tickLower = Number(posResult[5]);
      const tickUpper = Number(posResult[6]);
      const liquidity  = BigInt(posResult[7].toString());
      const tokensOwed0 = BigInt(posResult[10].toString());
      const tokensOwed1 = BigInt(posResult[11].toString());

      console.log(`[uniV3-lp] pos#${tokenId}: liq=${liquidity} owed0=${tokensOwed0} owed1=${tokensOwed1} t0=${token0.slice(0,8)} t1=${token1.slice(0,8)} fee=${fee}`);
      if (liquidity === 0n && tokensOwed0 === 0n && tokensOwed1 === 0n) continue;

      // Get token metadata (decimals + symbol)
      const [[dec0Res], [dec1Res], [sym0Res], [sym1Res]] = await Promise.all([
        call(token0, erc20Iface, "decimals", []),
        call(token1, erc20Iface, "decimals", []),
        call(token0, erc20Iface, "symbol",   []),
        call(token1, erc20Iface, "symbol",   []),
      ]);
      const dec0 = Number(dec0Res);
      const dec1 = Number(dec1Res);
      const sym0 = String(sym0Res);
      const sym1 = String(sym1Res);

      // Get pool address and current price
      const [poolAddr] = await call(factoryAddress, factoryIface, "getPool", [token0, token1, fee]);
      if (String(poolAddr) === ethers.ZeroAddress) continue;

      const [sqrtPriceX96Res] = await call(String(poolAddr), poolIface, "slot0", []);
      const sqrtPriceX96 = BigInt(sqrtPriceX96Res.toString());

      // Calculate position amounts (atomic units)
      const { amount0: pa0, amount1: pa1 } = calcUniV3Amounts(sqrtPriceX96, tickLower, tickUpper, liquidity);

      // Total including uncollected fees
      const total0 = pa0 + Number(tokensOwed0);
      const total1 = pa1 + Number(tokensOwed1);
      const h0 = total0 / Math.pow(10, dec0);
      const h1 = total1 / Math.pow(10, dec1);

      // Pool-derived price: token0 in terms of token1 (human units)
      const Q96   = 2 ** 96;
      const sqrtF = Number(sqrtPriceX96) / Q96;
      const p0in1 = sqrtF * sqrtF * Math.pow(10, dec0) / Math.pow(10, dec1);

      const s0 = sym0.toUpperCase();
      const s1 = sym1.toUpperCase();

      let posUsd = 0;
      if (STABLE_SYMS.has(s1)) {
        posUsd = h0 * p0in1 + h1;
      } else if (STABLE_SYMS.has(s0)) {
        posUsd = h0 + (p0in1 > 0 ? h1 / p0in1 : 0);
      } else {
        const usd0 = knownPriceBySymbol(s0, prices);
        const usd1 = knownPriceBySymbol(s1, prices);
        if (usd0 != null) posUsd += h0 * usd0;
        else if (usd1 != null && p0in1 > 0) posUsd += h0 * (usd1 / p0in1);
        if (usd1 != null) posUsd += h1 * usd1;
        else if (usd0 != null && p0in1 > 0) posUsd += h1 * (usd0 * p0in1);
      }

      console.log(`[uniV3-lp] pos#${tokenId}: ${s0}/${s1} h0=${h0.toFixed(4)} h1=${h1.toFixed(4)} p0in1=${p0in1.toFixed(8)} usd=$${posUsd.toFixed(2)}`);
      if (posUsd > 0) {
        const tokenUri = await fetchErc721TokenUri(provider, nfpmAddress, tokenId);
        const meta = tokenUri ? await fetchNftMeta(tokenUri) : null;
        totalUsd += posUsd;
        nftPositions.push({
          contractAddress: nfpmAddress.toLowerCase(),
          tokenId: tokenId.toString(),
          contractName: "Uniswap V3 Position NFT",
          tokenSymbol: "UNI-V3-POS",
          standard: "ERC-721",
          name: meta?.name ?? `${sym0}/${sym1} LP Position`,
          description: meta?.description ?? `Active liquidity position on ${chain.name} (${sym0}/${sym1}, fee ${fee.toString()}).`,
          imageUrl: meta?.image ? resolveNftImageUri(meta.image) : null,
          tokenUri,
          explorerUrl: `${chain.explorerBase}/token/${nfpmAddress}?a=${tokenId.toString()}`,
          openseaUrl: chain.chainId === 137
            ? `https://opensea.io/assets/matic/${nfpmAddress}/${tokenId.toString()}`
            : `https://opensea.io/assets/${chain.name}/${nfpmAddress}/${tokenId.toString()}`,
          chainName: chain.name,
          chainId: chain.chainId,
          isLiquidityPosition: true,
          liquidityUsd: Number(posUsd.toFixed(2)),
          poolLabel: `${sym0}/${sym1}`,
        });
      }
    } catch (err) {
      console.warn(`[uniV3-lp] pos#${tokenId} error:`, String((err as Error)?.message).slice(0, 100));
    }
  }
  return { totalUsd, nftPositions };
}

async function buildLiquidityPositionNft(
  rpcUrl: string,
  chain: Pick<ChainConfig, "chainId" | "name" | "explorerBase">,
  nfpmAddress: string,
  factoryAddress: string,
  tokenId: bigint,
  prices: Prices,
  status: "active" | "legacy",
  /** Block at which the NFT was minted. Used for historical eth_call if the NFT was burned. */
  mintBlock?: number,
): Promise<ChainNftHolding | null> {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const nfpmIface = new ethers.Interface(NFPM_ABI);
  const poolIface = new ethers.Interface(POOL_SLOT0_ABI);
  const factoryIface = new ethers.Interface(FACTORY_GETPOOL_ABI);
  const erc20Iface = new ethers.Interface(ERC20_META_ABI);

  const call = async (to: string, iface: ethers.Interface, fn: string, args: unknown[], blockTag?: number): Promise<ethers.Result> => {
    const data = iface.encodeFunctionData(fn, args);
    const raw = await provider.call({ to, data, ...(blockTag != null ? { blockTag } : {}) });
    return iface.decodeFunctionResult(fn, raw);
  };

  try {
    // Try current state first; if the NFT was burned, fall back to historical call at mint block.
    let posResult: ethers.Result;
    try {
      posResult = await call(nfpmAddress, nfpmIface, "positions", [tokenId]);
    } catch {
      if (mintBlock == null) return null;
      console.log(`[uniV3-backfill] pos#${tokenId} burned — retrying at block ${mintBlock}`);
      posResult = await call(nfpmAddress, nfpmIface, "positions", [tokenId], mintBlock);
    }
    const token0    = String(posResult[2]);
    const token1    = String(posResult[3]);
    const fee       = BigInt(posResult[4].toString());
    const tickLower = Number(posResult[5]);
    const tickUpper = Number(posResult[6]);
    const liquidity = BigInt(posResult[7].toString());
    const tokensOwed0 = BigInt(posResult[10].toString());
    const tokensOwed1 = BigInt(posResult[11].toString());

    const [[dec0Res], [dec1Res], [sym0Res], [sym1Res]] = await Promise.all([
      call(token0, erc20Iface, "decimals", []),
      call(token1, erc20Iface, "decimals", []),
      call(token0, erc20Iface, "symbol",   []),
      call(token1, erc20Iface, "symbol",   []),
    ]);
    const dec0 = Number(dec0Res);
    const dec1 = Number(dec1Res);
    const sym0 = String(sym0Res);
    const sym1 = String(sym1Res);

    const [poolAddr] = await call(factoryAddress, factoryIface, "getPool", [token0, token1, fee]);
    if (String(poolAddr) === ethers.ZeroAddress) return null;

    const [sqrtPriceX96Res] = await call(String(poolAddr), poolIface, "slot0", []);
    const sqrtPriceX96 = BigInt(sqrtPriceX96Res.toString());
    const { amount0: pa0, amount1: pa1 } = calcUniV3Amounts(sqrtPriceX96, tickLower, tickUpper, liquidity);
    const total0 = pa0 + Number(tokensOwed0);
    const total1 = pa1 + Number(tokensOwed1);
    const h0 = total0 / Math.pow(10, dec0);
    const h1 = total1 / Math.pow(10, dec1);
    const Q96 = 2 ** 96;
    const sqrtF = Number(sqrtPriceX96) / Q96;
    const p0in1 = sqrtF * sqrtF * Math.pow(10, dec0) / Math.pow(10, dec1);
    const s0 = sym0.toUpperCase();
    const s1 = sym1.toUpperCase();

    let posUsd = 0;
    if (STABLE_SYMS.has(s1)) {
      posUsd = h0 * p0in1 + h1;
    } else if (STABLE_SYMS.has(s0)) {
      posUsd = h0 + (p0in1 > 0 ? h1 / p0in1 : 0);
    } else {
      const usd0 = knownPriceBySymbol(s0, prices);
      const usd1 = knownPriceBySymbol(s1, prices);
      if (usd0 != null) posUsd += h0 * usd0;
      else if (usd1 != null && p0in1 > 0) posUsd += h0 * (usd1 / p0in1);
      if (usd1 != null) posUsd += h1 * usd1;
      else if (usd0 != null && p0in1 > 0) posUsd += h1 * (usd0 * p0in1);
    }

    const tokenUri = await fetchErc721TokenUri(provider, nfpmAddress, tokenId);
    const meta = tokenUri ? await fetchNftMeta(tokenUri) : null;

    return {
      contractAddress: nfpmAddress.toLowerCase(),
      tokenId: tokenId.toString(),
      contractName: "Uniswap V3 Position NFT",
      tokenSymbol: "UNI-V3-POS",
      standard: "ERC-721",
      name: meta?.name ?? `${sym0}/${sym1} LP Position`,
      description: meta?.description ?? `${status === "legacy" ? "Legacy" : "Active"} liquidity position on ${chain.name} (${sym0}/${sym1}, fee ${fee.toString()}).`,
      imageUrl: meta?.image ? resolveNftImageUri(meta.image) : null,
      tokenUri,
      explorerUrl: `${chain.explorerBase}/token/${nfpmAddress}?a=${tokenId.toString()}`,
      openseaUrl: chain.chainId === 137
        ? `https://opensea.io/assets/matic/${nfpmAddress}/${tokenId.toString()}`
        : `https://opensea.io/assets/${chain.name}/${nfpmAddress}/${tokenId.toString()}`,
      chainName: chain.name,
      chainId: chain.chainId,
      isLiquidityPosition: true,
      liquidityUsd: posUsd > 0 ? Number(posUsd.toFixed(2)) : null,
      poolLabel: `${sym0}/${sym1}`,
    };
  } catch {
    return null;
  }
}

export async function backfillHistoricalLiquidityPoolPositions(address: string): Promise<HistoricalLiquidityPoolPosition[]> {
  const walletAddress = address.toLowerCase();
  const prices = await fetchAllBasePrices();
  const current = await fetchMultiChainSnapshot(address);
  const activeKeys = new Set(
    current.nfts
      .filter((nft) => nft.isLiquidityPosition && nft.chainId != null)
      .map((nft) => `${nft.chainId}:${nft.contractAddress.toLowerCase()}:${nft.tokenId}`),
  );

  /** Scan one chain for historical LP positions — returns array (may be empty on failure). */
  const scanChain = async (chain: ChainConfig): Promise<HistoricalLiquidityPoolPosition[]> => {
    if (!chain.uniV3NfpmAddress || !chain.uniV3FactoryAddress) return [];
    const results: HistoricalLiquidityPoolPosition[] = [];
    const tokenIds = new Set<string>();

    // Strategy 1: Etherscan tokennfttx filtered by NFPM contractaddress.
    // Filtering by contractaddress ensures all 100 slots per page are LP transfers,
    // not diluted by game/NFT transfers from the same wallet.
    try {
      const nftHistory = await fetchNftTxHistory(chain.chainId, address, 100, chain.uniV3NfpmAddress);
      for (const row of nftHistory as NftHistoryRow[]) {
        if (!row.tokenID) continue;
        tokenIds.add(String(row.tokenID));
      }
      console.log(`[uniV3-backfill] ${chain.name}: Etherscan found ${tokenIds.size} tokenId(s)`);
    } catch (err) {
      console.warn(`[uniV3-backfill] ${chain.name} Etherscan failed:`, (err as Error)?.message?.slice(0, 60));
    }

    // Strategy 2: chunked eth_getLogs — run in parallel with Etherscan, union results.
    // Also records the mint block (Transfer from 0x0 → wallet) so burned NFTs can
    // be queried via historical eth_call at buildLiquidityPositionNft time.
    const mintBlocks = new Map<string, number>();
    try {
      const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
      const latest = await provider.getBlockNumber();
      const range = chain.chainId === 8453 ? 500 : chain.chainId === 137 ? 10_000 : 50_000;
      const scanFrom = Math.max(0, latest - 3_000_000);
      const walletTopic = ethers.zeroPadValue(walletAddress, 32).toLowerCase();
      const zeroTopic   = ethers.zeroPadValue("0x0000000000000000000000000000000000000000", 32).toLowerCase();
      for (let from = scanFrom; from <= latest; from += range + 1) {
        const to = Math.min(latest, from + range);
        try {
          // Fetch both: mints (from=0, to=wallet) and all incoming transfers (to=wallet)
          const [mintLogs, recvLogs] = await Promise.all([
            provider.getLogs({ address: chain.uniV3NfpmAddress, fromBlock: from, toBlock: to,
              topics: [ERC721_TRANSFER_TOPIC, zeroTopic, walletTopic] }),
            provider.getLogs({ address: chain.uniV3NfpmAddress, fromBlock: from, toBlock: to,
              topics: [ERC721_TRANSFER_TOPIC, null, walletTopic] }),
          ]);
          for (const log of [...mintLogs, ...recvLogs]) {
            const topic = log.topics?.[3];
            if (!topic) continue;
            try {
              const tid = BigInt(topic).toString();
              tokenIds.add(tid);
              // Record earliest seen block as mint block (for historical fallback)
              if (!mintBlocks.has(tid) || Number(log.blockNumber) < (mintBlocks.get(tid) ?? Infinity)) {
                mintBlocks.set(tid, Number(log.blockNumber));
              }
            } catch { /* ignore */ }
          }
        } catch { /* chunk failed, continue */ }
      }
      console.log(`[uniV3-backfill] ${chain.name}: after eth_getLogs union → ${tokenIds.size} tokenId(s), ${mintBlocks.size} with mint block`);
    } catch (err) {
      console.warn(`[uniV3-backfill] ${chain.name} eth_getLogs failed:`, (err as Error)?.message?.slice(0, 60));
    }

    for (const tokenId of tokenIds) {
      const key = `${chain.chainId}:${chain.uniV3NfpmAddress.toLowerCase()}:${tokenId}`;
      if (activeKeys.has(key)) continue;
      try {
        const built = await buildLiquidityPositionNft(
          chain.rpcUrl,
          chain,
          chain.uniV3NfpmAddress,
          chain.uniV3FactoryAddress,
          BigInt(tokenId),
          prices,
          "legacy",
          mintBlocks.get(tokenId),
        );
        if (built) results.push({ ...built, status: "legacy" });
      } catch (err) {
        console.warn(`[uniV3-backfill] ${chain.name} pos#${tokenId}:`, (err as Error)?.message?.slice(0, 60));
      }
    }

    return results;
  };

  // Run all chains in parallel; a failure on one chain never blocks others.
  const settled = await Promise.allSettled(
    CHAINS.filter((c) => c.uniV3NfpmAddress && c.uniV3FactoryAddress).map(scanChain),
  );

  const discovered: HistoricalLiquidityPoolPosition[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") discovered.push(...result.value);
    else console.warn("[uniV3-backfill] chain task rejected:", result.reason);
  }
  return discovered;
}

// ─── Single-chain snapshot ───────────────────────────────────────────────────

async function fetchChainSnapshot(
  chain: ChainConfig,
  address: string,
  prices: Prices,
): Promise<ChainSnapshot> {
  // 1. Native balance via RPC (always reliable — no API-key restriction)
  const nativeWei  = await fetchNativeBalanceRpc(chain.rpcUrl, address);
  const nativeBal  = Number(ethers.formatEther(nativeWei));
  const nativeUsd  = tokenUsd(nativeBal, chain.nativePriceKey, prices);

  // 2. Token holdings
  const knownByAddr = new Map(chain.knownTokens.map(t => [t.contractAddress.toLowerCase(), t]));
  const tokenHoldings: ChainTokenHolding[] = [];

  // For Polygon: discover additional tokens via Etherscan tokentx history
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

  // Seed known tokens (highest priority — reliable metadata + price mapping)
  for (const kt of chain.knownTokens) {
    const ca = kt.contractAddress.toLowerCase();
    if (!metaMap.has(ca)) metaMap.set(ca, { symbol: kt.symbol, name: kt.name, decimals: kt.decimals });
  }

  const contractsToCheck = Array.from(metaMap.keys());
  const withBalance: { contractAddress: string; rawBalance: bigint }[] = [];
  for (const ca of contractsToCheck) {
    // Use RPC for all chains — avoids API-key restrictions per chain
    const raw = await fetchTokenBalanceRpc(chain.rpcUrl, ca, address);
    if (raw > 0n) withBalance.push({ contractAddress: ca, rawBalance: raw });
  }

  // Batch-price unknown tokens via CoinGecko (only where network is supported)
  const unknownAddrs = withBalance.map(r => r.contractAddress).filter(ca => !knownByAddr.has(ca));
  const cgNetwork = chain.chainId === 137 ? "polygon-pos" : chain.chainId === 1 ? "ethereum" : chain.chainId === 56 ? "binance-smart-chain" : null;
  const cgPrices = cgNetwork && unknownAddrs.length ? await fetchCoinGeckoBatchFor(unknownAddrs, cgNetwork) : new Map<string, number>();

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

  // 3. NFTs — only via Etherscan (Polygon key works there)
  let nfts: ChainNftHolding[] = [];
  if (chain.fetchNfts && chain.chainId === 137) {
    const nftRows = await fetchNftTxHistory(chain.chainId, address);
    nfts = await resolveNfts(address, chain.rpcUrl, chain.explorerBase, nftRows);
  }

  // 4. Uniswap V3 LP positions
  // Try chain-specific NFPM first, then the canonical Uniswap V3 NFPM as fallback.
  const CANONICAL_NFPM    = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
  const CANONICAL_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
  let lpUsd = 0;
  let lpNfts: ChainNftHolding[] = [];
  if (chain.uniV3NfpmAddress && chain.uniV3FactoryAddress) {
    const primaryLp = await fetchUniV3LpValue(
      chain.rpcUrl, address,
      chain.uniV3NfpmAddress, chain.uniV3FactoryAddress,
      prices,
      chain,
    ).catch(err => {
      console.warn(`[uniV3-lp] ${chain.name} primary:`, (err as Error)?.message);
      return { totalUsd: 0, nftPositions: [] };
    });
    lpUsd = primaryLp.totalUsd;
    lpNfts = primaryLp.nftPositions;

    // If primary returned 0, try canonical NFPM (different deployment address)
    if (lpUsd === 0 && chain.uniV3NfpmAddress !== CANONICAL_NFPM) {
      const fallbackLp = await fetchUniV3LpValue(
        chain.rpcUrl, address,
        CANONICAL_NFPM, CANONICAL_FACTORY,
        prices,
        chain,
      ).catch(() => ({ totalUsd: 0, nftPositions: [] }));
      lpUsd = fallbackLp.totalUsd;
      lpNfts = fallbackLp.nftPositions;
    }
  }

  if (lpNfts.length > 0) {
    nfts = [...lpNfts, ...nfts];
  }

  const tokensUsd     = tokenHoldings.reduce((s, t) => s + (t.usdValue ?? 0), 0);
  const totalChainUsd = (nativeUsd ?? 0) + tokensUsd + lpUsd || null;

  return { chainId: chain.chainId, name: chain.name, nativeSymbol: chain.nativeSymbol, nativeBalance: nativeBal, nativeUsd, tokens: tokenHoldings, nfts, lpUsd, totalChainUsd };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Single CoinGecko call for all native-currency prices (avoids rate-limit from parallel calls). */
async function fetchAllBasePrices(): Promise<Prices> {
  const ids = ["polygon-ecosystem-token", "matic-network", "ethereum", "bitcoin", "binancecoin", "avalanche-2", "brla-digital"];
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const json = (await res.json()) as Record<string, { usd?: number }>;
    const get = (key: string) => {
      const v = json[key]?.usd;
      return v != null && Number.isFinite(v) && v > 0 ? v : null;
    };
    return {
      pol:  get("polygon-ecosystem-token") ?? get("matic-network"),
      eth:  get("ethereum"),
      btc:  get("bitcoin"),
      bnb:  get("binancecoin"),
      avax: get("avalanche-2"),
      brl:  get("brla-digital"),
    };
  } catch (err) {
    console.warn("[multi-chain] base price fetch failed:", (err as Error)?.message);
    return { pol: null, eth: null, btc: null, bnb: null, avax: null, brl: null };
  }
}

export async function fetchMultiChainSnapshot(address: string): Promise<MultiChainSnapshot> {
  const prices = await fetchAllBasePrices();
  console.log(`[multi-chain] prices — POL=$${prices.pol?.toFixed(4)}, ETH=$${prices.eth?.toFixed(2)}, BTC=$${prices.btc?.toFixed(0)}, BNB=$${prices.bnb?.toFixed(2)}, AVAX=$${prices.avax?.toFixed(2)}, BRL=$${prices.brl?.toFixed(4)}`);

  // Run all chains in parallel; settled so a single slow/broken RPC never blocks the rest.
  const settled = await Promise.allSettled(
    CHAINS.map((chain) => fetchChainSnapshot(chain, address, prices)),
  );

  const chainSnapshots: ChainSnapshot[] = [];
  for (let i = 0; i < settled.length; i++) {
    const chain = CHAINS[i];
    const result = settled[i];
    if (result.status === "rejected") {
      console.warn(`[multi-chain] ${chain.name} failed for ${address}:`, result.reason?.message);
      continue;
    }
    const snap = result.value;
    const hasBalance = snap.nativeBalance > 0 || snap.tokens.length > 0 || snap.nfts.length > 0 || snap.lpUsd > 0;
    console.log(`[multi-chain] ${chain.name} — native=${snap.nativeBalance.toFixed(4)} ${chain.nativeSymbol}, tokens=${snap.tokens.length}, lp=$${snap.lpUsd.toFixed(2)}, usd=${snap.totalChainUsd?.toFixed(2) ?? "0"}`);
    if (hasBalance) chainSnapshots.push(snap);
  }

  const totalUsd   = chainSnapshots.reduce((s, c) => s + (c.totalChainUsd ?? 0), 0) || null;
  const polySnap   = chainSnapshots.find(c => c.chainId === 137);
  const valuePol   = polySnap?.nativeBalance ?? null;

  // Aggregate tokens across all chains (de-duplicate by symbol if same price)
  const allTokens  = chainSnapshots.flatMap(c => c.tokens.map(t => ({ ...t, chain: c.name })));
  const allNfts    = chainSnapshots.flatMap(c => c.nfts);

  return { address, fetchedAt: new Date(), totalUsd, valuePol, chains: chainSnapshots, tokens: allTokens, nfts: allNfts };
}
