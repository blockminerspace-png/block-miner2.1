/**
 * Polygon transparency wallet helpers.
 * Tracks native POL + all ERC20 token inflows/outflows for tracked wallets.
 */
import { ethers } from "ethers";
import { getPolUsdPrice, getPolUsdPriceAt, getBtcUsdPrice, getEthUsdPrice } from "../utils/cryptoPrice.js";
import { etherscanRateLimitWait } from "../utils/etherscanRateLimiter.js";

const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";
const POLYGON_CHAIN_ID_STR = "137";
const MAX_TX_PAGE_SIZE = 100;
const MAX_TX_PAGES = 100;

type TxHistoryOpts = {
  pageSize?: unknown;
  maxPages?: unknown;
  sort?: unknown;
  previewLimit?: unknown;
};

function getApiKey(): string {
  return String(process.env.POLYGONSCAN_API_KEY || "").trim();
}

async function etherscanV2FetchOnce(params: Record<string, unknown>) {
  await etherscanRateLimitWait();

  const apiKey = getApiKey();
  const url = new URL(ETHERSCAN_V2_BASE);
  url.searchParams.set("chainid", POLYGON_CHAIN_ID_STR);
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    url.searchParams.set(k, String(v));
  }
  if (apiKey) url.searchParams.set("apikey", apiKey);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) {
    const err = new Error(`Etherscan V2 HTTP ${res.status}`);
    err.code = "ESCAN_HTTP";
    throw err;
  }
  const json = await res.json();
  const msg = String(json?.message || "");
  const result = json?.result;
  if (msg === "NOTOK" && result !== "No transactions found" && !String(result || "").includes("No transactions")) {
    const err = new Error(typeof result === "string" ? result : "Etherscan V2 error");
    err.code = "ESCAN_ERROR";
    throw err;
  }
  return json;
}

/** Retry once on rate-limit errors — helps when multiple background jobs share the same key. */
async function etherscanV2Fetch(params: Record<string, unknown>) {
  try {
    return await etherscanV2FetchOnce(params);
  } catch (err: unknown) {
    const msg = String((err as Error)?.message || "");
    if (msg.includes("rate limit") || msg.includes("NOTOK")) {
      await new Promise<void>((r) => setTimeout(r, 3_000));
      return await etherscanV2FetchOnce(params);
    }
    throw err;
  }
}

function clampInt(
  value: unknown,
  { min = 1, max = Number.MAX_SAFE_INTEGER, fallback = min }: { min?: number; max?: number; fallback?: number } = {},
): number {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function fetchTxPage(action: string, address: string, page: number, offset: number, sort = "desc") {
  const json = await etherscanV2Fetch({
    module: "account",
    action,
    address,
    startblock: 0,
    endblock: 99999999,
    page,
    offset,
    sort,
  });
  const list = json?.result;
  if (!Array.isArray(list)) return [];
  return list;
}

async function fetchTxHistory(action: string, address: string, opts: TxHistoryOpts = {}) {
  const pageSize = clampInt(opts.pageSize, {
    min: 1,
    max: MAX_TX_PAGE_SIZE,
    fallback: MAX_TX_PAGE_SIZE,
  });
  const maxPages = clampInt(opts.maxPages, {
    min: 1,
    max: MAX_TX_PAGES,
    fallback: MAX_TX_PAGES,
  });
  const sort = String(opts.sort || "asc").toLowerCase() === "desc" ? "desc" : "asc";
  const rows: unknown[] = [];
  let scannedPages = 0;
  let mayBeTruncated = false;

  for (let page = 1; page <= maxPages; page += 1) {
    scannedPages = page;
    const batch = await fetchTxPage(action, address, page, pageSize, sort);
    if (!batch.length) break;
    rows.push(...batch);
    if (batch.length < pageSize) {
      return { rows, scannedPages, pageSize, maxPages, mayBeTruncated: false };
    }
  }

  if (scannedPages === maxPages && rows.length === maxPages * pageSize) {
    mayBeTruncated = true;
  }

  return { rows, scannedPages, pageSize, maxPages, mayBeTruncated };
}

function receiptOk(tx: unknown): boolean {
  const t = tx as Record<string, unknown>;
  const s = t?.txreceipt_status;
  if (s === "1" || s === 1 || s === true) return true;
  if (s === "0" || s === 0 || s === false) return false;
  if (t?.isError === "0" || t?.isError === 0) return true;
  return true;
}

function weiFromTx(tx: unknown): bigint {
  try {
    const t = tx as Record<string, unknown>;
    return BigInt(String(t?.value || "0"));
  } catch {
    return 0n;
  }
}

function normalizeAddress(raw: unknown): string {
  const s = String(raw || "").trim();
  if (!s || !ethers.isAddress(s)) {
    const err = new Error("Invalid wallet address.");
    err.code = "INVALID_ADDRESS";
    throw err;
  }
  return ethers.getAddress(s);
}

type MovementRow = {
  kind: string;
  hash: unknown;
  traceId?: string;
  timeStamp: number;
  direction: "in" | "out";
  counterparty: unknown;
  valueWei: string;
  valuePol: number;
};

async function sumHistoricalPolUsd(
  movements: MovementRow[],
  direction: "in" | "out",
): Promise<number | null> {
  const dailyTotals = new Map<string, { timestampSec: number; totalPol: number }>();

  for (const movement of movements) {
    if (movement.direction !== direction) continue;
    const dayKey = new Date(movement.timeStamp * 1000).toISOString().slice(0, 10);
    const existing = dailyTotals.get(dayKey);
    if (existing) {
      existing.totalPol += movement.valuePol;
    } else {
      dailyTotals.set(dayKey, { timestampSec: movement.timeStamp, totalPol: movement.valuePol });
    }
  }

  if (!dailyTotals.size) return 0;

  let totalUsd = 0;
  let hasAnyPrice = false;
  for (const { timestampSec, totalPol } of dailyTotals.values()) {
    try {
      const polUsd = Number(await getPolUsdPriceAt(timestampSec));
      if (Number.isFinite(polUsd) && polUsd > 0) {
        totalUsd += totalPol * polUsd;
        hasAnyPrice = true;
      }
    } catch {
      // Ignore individual day failures; caller can fall back to snapshot preservation.
    }
  }

  return hasAnyPrice ? totalUsd : null;
}

function buildMovementSummary(address: string, normal: unknown[], internal: unknown[] = []) {
  const addr = address.toLowerCase();
  const movements: MovementRow[] = [];
  let totalInWei = 0n;
  let totalOutWei = 0n;
  const seenInternal = new Set<string>();

  for (const tx of normal) {
    if (!receiptOk(tx)) continue;
    const t = tx as Record<string, unknown>;
    const value = weiFromTx(tx);
    const from = String(t.from || "").toLowerCase();
    const to = String(t.to || "").toLowerCase();
    if (value === 0n) continue;

    let direction: "in" | "out" | null = null;
    let counterparty: unknown = "";
    if (to === addr && from !== addr) {
      direction = "in";
      counterparty = t.from;
      totalInWei += value;
    } else if (from === addr) {
      direction = "out";
      counterparty = t.to || "";
      totalOutWei += value;
    }
    if (!direction) continue;

    movements.push({
      kind: "normal",
      hash: t.hash,
      timeStamp: Number(t.timeStamp) || 0,
      direction,
      counterparty,
      valueWei: value.toString(),
      valuePol: Number(ethers.formatEther(value)),
    });
  }

  for (const tx of internal) {
    const t = tx as Record<string, unknown>;
    const isError = String(t.isError ?? "0");
    const errCode = String(t.errCode ?? "");
    if (isError === "1" || errCode) continue;

    const value = weiFromTx(tx);
    if (value === 0n) continue;

    const from = String(t.from || "").toLowerCase();
    const to = String(t.to || "").toLowerCase();
    const hash = String(t.hash || "");
    const traceId = String(t.traceId ?? t.index ?? t.blockNumber ?? "");
    const dedupeKey = `${hash}:${traceId}:${from}:${to}:${value.toString()}`;
    if (seenInternal.has(dedupeKey)) continue;
    seenInternal.add(dedupeKey);

    let direction: "in" | "out" | null = null;
    let counterparty: unknown = "";
    if (to === addr && from !== addr) {
      direction = "in";
      counterparty = t.from;
      totalInWei += value;
    } else if (from === addr) {
      direction = "out";
      counterparty = t.to || "";
      totalOutWei += value;
    }
    if (!direction) continue;

    movements.push({
      kind: "internal",
      hash: t.hash,
      traceId,
      timeStamp: Number(t.timeStamp) || 0,
      direction,
      counterparty,
      valueWei: value.toString(),
      valuePol: Number(ethers.formatEther(value)),
    });
  }

  movements.sort((a, b) => b.timeStamp - a.timeStamp);

  return {
    movements,
    totalInWei,
    totalOutWei,
    totalInPol: Number(ethers.formatEther(totalInWei)),
    totalOutPol: Number(ethers.formatEther(totalOutWei)),
  };
}

type TokenTransferRow = {
  contractAddress: string;
  tokenSymbol: string;
  tokenName: string;
  tokenDecimal: string;
  from: string;
  to: string;
  value: string;
  hash: string;
  timeStamp: string;
  isError?: string;
};

type TokenMovementSummaryEntry = {
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  totalIn: number;
  totalOut: number;
  totalInUsd: number | null;
  totalOutUsd: number | null;
};

async function buildTokenMovementSummary(
  address: string,
  tokenTxList: unknown[],
  prices: { pol: number | null; btc: number | null; eth: number | null },
): Promise<{ byToken: TokenMovementSummaryEntry[]; totalInUsd: number | null; totalOutUsd: number | null }> {
  const addr = address.toLowerCase();

  const knownByAddr = new Map(
    POLYGON_KNOWN_TOKENS.map((t) => [t.contractAddress.toLowerCase(), t]),
  );

  const map = new Map<string, { symbol: string; name: string; decimals: number; totalIn: bigint; totalOut: bigint }>();

  for (const tx of tokenTxList) {
    const t = tx as TokenTransferRow;
    if (t.isError === "1") continue;
    let value: bigint;
    try {
      value = BigInt(String(t.value || "0"));
    } catch {
      continue;
    }
    if (value === 0n) continue;

    const from = String(t.from || "").toLowerCase();
    const to   = String(t.to   || "").toLowerCase();
    const contractAddr = String(t.contractAddress || "").toLowerCase();
    if (!contractAddr) continue;

    if (!map.has(contractAddr)) {
      map.set(contractAddr, {
        symbol:   String(t.tokenSymbol || "UNKNOWN"),
        name:     String(t.tokenName   || ""),
        decimals: Math.max(0, Math.min(36, Number(t.tokenDecimal || "18") || 18)),
        totalIn:  0n,
        totalOut: 0n,
      });
    }

    const entry = map.get(contractAddr)!;
    if (to === addr && from !== addr) entry.totalIn  += value;
    else if (from === addr)           entry.totalOut += value;
  }

  let totalInUsd  = 0;
  let totalOutUsd = 0;
  let hasInUsd = false;
  let hasOutUsd = false;
  const byToken: TokenMovementSummaryEntry[] = [];
  const unknownAddrs = Array.from(map.keys()).filter((contractAddress) => !knownByAddr.has(contractAddress));
  const cgPrices = await fetchCoinGeckoBatchPrices(unknownAddrs);

  for (const [contractAddress, entry] of map) {
    const decimals  = entry.decimals;
    const totalIn  = Number(ethers.formatUnits(entry.totalIn,  decimals));
    const totalOut = Number(ethers.formatUnits(entry.totalOut, decimals));
    if (totalIn === 0 && totalOut === 0) continue;

    const known = knownByAddr.get(contractAddress);
    let usdPerToken: number | null = null;
    if (known) {
      if (known.priceKey === "stable") usdPerToken = 1;
      else if (known.priceKey === "btc") usdPerToken = prices.btc;
      else if (known.priceKey === "eth") usdPerToken = prices.eth;
    } else {
      usdPerToken = cgPrices.get(contractAddress) ?? null;
    }

    const totalInTokenUsd  = usdPerToken != null ? totalIn  * usdPerToken : null;
    const totalOutTokenUsd = usdPerToken != null ? totalOut * usdPerToken : null;

    if (totalInTokenUsd  != null) {
      totalInUsd += totalInTokenUsd;
      hasInUsd = true;
    }
    if (totalOutTokenUsd != null) {
      totalOutUsd += totalOutTokenUsd;
      hasOutUsd = true;
    }

    byToken.push({ contractAddress, symbol: entry.symbol, name: entry.name, decimals, totalIn, totalOut, totalInUsd: totalInTokenUsd, totalOutUsd: totalOutTokenUsd });
  }

  byToken.sort((a, b) => (b.totalInUsd ?? 0) - (a.totalInUsd ?? 0));

  return {
    byToken,
    totalInUsd: hasInUsd ? totalInUsd : null,
    totalOutUsd: hasOutUsd ? totalOutUsd : null,
  };
}

export async function fetchWalletNativeActivity(rawAddress: unknown, opts: TxHistoryOpts = {}) {
  const address = normalizeAddress(rawAddress);
  const [history, internalHistory] = await Promise.all([
    fetchTxHistory("txlist", address, opts),
    fetchTxHistory("txlistinternal", address, opts),
  ]);
  const normal = history.rows as unknown[];
  const internal = internalHistory.rows as unknown[];
  const summary = buildMovementSummary(address, normal, internal);
  let polUsdPrice: number | null = null;
  try {
    polUsdPrice = Number(await getPolUsdPrice());
  } catch {
    polUsdPrice = null;
  }
  const [totalInHistoricalUsd, totalOutHistoricalUsd] = await Promise.all([
    sumHistoricalPolUsd(summary.movements, "in"),
    sumHistoricalPolUsd(summary.movements, "out"),
  ]);

  return {
    address,
    apiKeyConfigured: Boolean(getApiKey()),
    note: history.mayBeTruncated
      || internalHistory.mayBeTruncated
      ? "POL transfers include normal + internal transactions (Polygon). The API pagination scan may be capped at 10,000 source records per source for very busy wallets."
      : "POL transfers include normal + internal transactions (Polygon).",
    history: {
      scannedPages: Math.max(history.scannedPages, internalHistory.scannedPages),
      pageSize: history.pageSize,
      sourceRecordCount: normal.length + internal.length,
      mayBeTruncated: history.mayBeTruncated || internalHistory.mayBeTruncated,
    },
    summary: {
      totalInPol: summary.totalInPol,
      totalOutPol: summary.totalOutPol,
      totalInUsd: totalInHistoricalUsd != null ? Number(totalInHistoricalUsd.toFixed(2)) : null,
      totalOutUsd: totalOutHistoricalUsd != null ? Number(totalOutHistoricalUsd.toFixed(2)) : null,
      movementCount: summary.movements.length,
      historyMayBeTruncated: history.mayBeTruncated,
      polUsdPrice,
    },
    movements: summary.movements,
  };
}

type TrackedWalletInput = {
  id?: number | null;
  label?: string | null;
  address: string;
  chain?: string | null;
  assetSymbol?: string | null;
  explorerBaseUrl?: string | null;
  includeInTotals?: boolean;
};

type PerWalletSummaryRow = {
  id: number | null;
  label: string;
  address: string;
  chain: string;
  assetSymbol: string;
  explorerBaseUrl: string;
  includeInTotals: boolean;
  summary: {
    totalInPol: number;
    totalOutPol: number;
    totalInUsd: number | null;
    totalOutUsd: number | null;
    movementCount: number;
    historyMayBeTruncated: boolean;
  };
  history: {
    scannedPages: number;
    pageSize: number;
    sourceRecordCount: number;
    mayBeTruncated: boolean;
  };
  movements: MovementRow[];
};

export async function fetchTrackedWalletsSummary(wallets: unknown, opts: TxHistoryOpts = {}) {
  const previewLimit = clampInt(opts.previewLimit, {
    min: 1,
    max: MAX_TX_PAGE_SIZE,
    fallback: 10,
  });
  const activeWallets: TrackedWalletInput[] = Array.isArray(wallets) ? (wallets as TrackedWalletInput[]) : [];
  let polUsdPrice: number | null = null;
  try {
    polUsdPrice = Number(await getPolUsdPrice());
  } catch {
    polUsdPrice = null;
  }

  const perWallet: PerWalletSummaryRow[] = [];
  let totalInWei = 0n;
  let totalOutWei = 0n;
  let totalMovementCount = 0;
  let historyMayBeTruncated = false;

  for (const wallet of activeWallets) {
    const address = normalizeAddress(wallet.address);
    const [history, internalHistory] = await Promise.all([
      fetchTxHistory("txlist", address, opts),
      fetchTxHistory("txlistinternal", address, opts),
    ]);
    const normal = history.rows as unknown[];
    const internal = internalHistory.rows as unknown[];
    const summary = buildMovementSummary(address, normal, internal);
    const [totalInHistoricalUsd, totalOutHistoricalUsd] = await Promise.all([
      sumHistoricalPolUsd(summary.movements, "in"),
      sumHistoricalPolUsd(summary.movements, "out"),
    ]);
    const includeInTotals = wallet.includeInTotals !== false;
    if (includeInTotals) {
      totalInWei += summary.totalInWei;
      totalOutWei += summary.totalOutWei;
      totalMovementCount += summary.movements.length;
      historyMayBeTruncated ||= history.mayBeTruncated || internalHistory.mayBeTruncated;
    }

    perWallet.push({
      id: wallet.id ?? null,
      label: String(wallet.label || "").trim() || address,
      address,
      chain: String(wallet.chain || "polygon"),
      assetSymbol: String(wallet.assetSymbol || "POL"),
      explorerBaseUrl: wallet.explorerBaseUrl || "https://polygonscan.com/address",
      includeInTotals,
      summary: {
        totalInPol: summary.totalInPol,
        totalOutPol: summary.totalOutPol,
        totalInUsd: totalInHistoricalUsd != null ? Number(totalInHistoricalUsd.toFixed(2)) : null,
        totalOutUsd: totalOutHistoricalUsd != null ? Number(totalOutHistoricalUsd.toFixed(2)) : null,
        movementCount: summary.movements.length,
        historyMayBeTruncated: history.mayBeTruncated || internalHistory.mayBeTruncated,
      },
      history: {
        scannedPages: Math.max(history.scannedPages, internalHistory.scannedPages),
        pageSize: history.pageSize,
        sourceRecordCount: normal.length + internal.length,
        mayBeTruncated: history.mayBeTruncated || internalHistory.mayBeTruncated,
      },
      movements: summary.movements.slice(0, previewLimit),
    });
  }

  const totalInPol = Number(ethers.formatEther(totalInWei));
  const totalOutPol = Number(ethers.formatEther(totalOutWei));

  return {
    apiKeyConfigured: Boolean(getApiKey()),
    polUsdPrice,
    note: historyMayBeTruncated
      ? "Totals may be capped by the explorer API limit for wallets with more than 10,000 source records."
      : "Totals cover the fetched normal-transaction history for each tracked wallet.",
    summary: {
      totalInPol: Number(totalInPol.toFixed(6)),
      totalOutPol: Number(totalOutPol.toFixed(6)),
      totalInUsd: polUsdPrice != null ? Number((totalInPol * polUsdPrice).toFixed(2)) : null,
      totalOutUsd: polUsdPrice != null ? Number((totalOutPol * polUsdPrice).toFixed(2)) : null,
      movementCount: totalMovementCount,
      walletCount: perWallet.length,
      historyMayBeTruncated,
    },
    wallets: perWallet,
  };
}

type TrackedWalletLiveInput = {
  id?: number | null;
  label?: string | null;
  address: string;
  chain?: string | null;
  assetSymbol?: string | null;
  explorerBaseUrl?: string | null;
  isActive?: boolean;
  displayMode?: string | null;
};

export type TokenHolding = {
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: number;
  usdValue: number | null;
};

export type NftHolding = {
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

export type WalletLiveEntry = {
  id: number | null;
  label: string;
  address: string;
  chain: string;
  assetSymbol: string;
  explorerBaseUrl: string;
  isActive: boolean;
  displayMode: string;
  valuePol: number | null;
  valueUsd: number | null;
  isPartialUsd?: boolean;
  tokens?: TokenHolding[];
  nfts?: NftHolding[];
};

// ─── NFT helpers ─────────────────────────────────────────────────────────────

const ERC721_ABI_MINIMAL = ["function tokenURI(uint256 tokenId) view returns (string)"];

function resolveIpfsUrl(uri: string): string {
  if (uri.startsWith("ipfs://")) return "https://ipfs.io/ipfs/" + uri.slice(7);
  return uri;
}

type NftMeta = { name?: string; description?: string; image?: string };

function parseInlineNftMeta(tokenUri: string): NftMeta | null {
  try {
    if (tokenUri.startsWith("data:application/json;base64,")) {
      return JSON.parse(Buffer.from(tokenUri.slice(29), "base64").toString("utf8")) as NftMeta;
    }
    if (tokenUri.startsWith("data:application/json,")) {
      return JSON.parse(decodeURIComponent(tokenUri.slice(22))) as NftMeta;
    }
    if (tokenUri.startsWith("data:application/json;utf8,")) {
      return JSON.parse(tokenUri.slice(27)) as NftMeta;
    }
  } catch { /* ignore */ }
  return null;
}

async function fetchNftMeta(tokenUri: string): Promise<NftMeta | null> {
  const inline = parseInlineNftMeta(tokenUri);
  if (inline) return inline;
  const url = resolveIpfsUrl(tokenUri);
  if (!url.startsWith("http")) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    return (await res.json()) as NftMeta;
  } catch { return null; }
}

async function fetchNftHoldings721(address: string): Promise<NftHolding[]> {
  const txList = await fetchTxHistory("tokennfttx", address, { pageSize: 100, maxPages: 50 });
  if (!txList.rows.length) return [];

  const addr = address.toLowerCase();

  // Compute currently-held NFTs: process transfers chronologically, track receives/sends
  type HeldInfo = { contractAddress: string; tokenId: string; contractName: string; tokenSymbol: string };
  const held = new Map<string, HeldInfo>();
  const sorted = (txList.rows as Record<string, unknown>[]).sort(
    (a, b) => Number(a.timeStamp || 0) - Number(b.timeStamp || 0),
  );

  for (const t of sorted) {
    const from = String(t.from || "").toLowerCase();
    const to   = String(t.to   || "").toLowerCase();
    const ca   = String(t.contractAddress || "").toLowerCase();
    const tid  = String(t.tokenID || "");
    const key  = `${ca}:${tid}`;
    if (to === addr) {
      held.set(key, { contractAddress: ca, tokenId: tid, contractName: String(t.tokenName || ""), tokenSymbol: String(t.tokenSymbol || "") });
    } else if (from === addr) {
      held.delete(key);
    }
  }

  if (held.size === 0) return [];

  const provider = new ethers.JsonRpcProvider(
    process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
  );

  const results = await Promise.all(
    Array.from(held.values()).map(async (info): Promise<NftHolding> => {
      const base: NftHolding = {
        contractAddress: info.contractAddress,
        tokenId:         info.tokenId,
        contractName:    info.contractName,
        tokenSymbol:     info.tokenSymbol,
        standard:        "ERC-721",
        name:            null,
        description:     null,
        imageUrl:        null,
        tokenUri:        null,
        explorerUrl:     `https://polygonscan.com/token/${info.contractAddress}?a=${info.tokenId}`,
        openseaUrl:      `https://opensea.io/assets/matic/${info.contractAddress}/${info.tokenId}`,
      };
      try {
        const contract = new ethers.Contract(info.contractAddress, ERC721_ABI_MINIMAL, provider);
        const uri: string = await Promise.race([
          contract.tokenURI(BigInt(info.tokenId)) as Promise<string>,
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8_000)),
        ]);
        base.tokenUri = uri;
        const meta = await fetchNftMeta(uri);
        if (meta) {
          base.name        = meta.name        ?? null;
          base.description = meta.description ?? null;
          if (meta.image) base.imageUrl = resolveIpfsUrl(meta.image);
        }
      } catch { /* tokenURI unavailable — still include the NFT without image */ }
      return base;
    }),
  );

  return results;
}

// Well-known Polygon mainnet tokens with hardcoded price resolution.
// Used as a seed so the wallet always checks these even if tokentx history is empty.
const POLYGON_KNOWN_TOKENS = [
  { contractAddress: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", symbol: "USDC",   name: "USD Coin",        decimals: 6,  priceKey: "stable" },
  { contractAddress: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", symbol: "USDC.e", name: "Bridged USDC",   decimals: 6,  priceKey: "stable" },
  { contractAddress: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", symbol: "USDT",   name: "Tether USD",     decimals: 6,  priceKey: "stable" },
  { contractAddress: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", symbol: "DAI",    name: "Dai Stablecoin", decimals: 18, priceKey: "stable" },
  { contractAddress: "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", symbol: "WBTC",   name: "Wrapped BTC",    decimals: 8,  priceKey: "btc"    },
  { contractAddress: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", symbol: "WETH",   name: "Wrapped Ether",  decimals: 18, priceKey: "eth"    },
] as const;

type PriceKey = "stable" | "btc" | "eth";

function knownUsd(priceKey: PriceKey, balance: number, prices: { btc: number | null; eth: number | null }): number | null {
  if (priceKey === "stable") return balance;
  if (priceKey === "btc")    return prices.btc != null ? balance * prices.btc : null;
  if (priceKey === "eth")    return prices.eth != null ? balance * prices.eth : null;
  return null;
}

/**
 * Fetch current USD prices for a batch of token contract addresses via CoinGecko
 * Polygon token price endpoint (free tier, no key required).
 */
async function fetchCoinGeckoBatchPrices(contractAddresses: string[]): Promise<Map<string, number>> {
  const prices = new Map<string, number>();
  if (contractAddresses.length === 0) return prices;
  try {
    const addrs = contractAddresses.map((a) => a.toLowerCase()).join(",");
    const url = `https://api.coingecko.com/api/v3/simple/token_price/polygon-pos?contract_addresses=${addrs}&vs_currencies=usd`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return prices;
    const json = (await res.json()) as Record<string, { usd?: number }>;
    for (const [addr, data] of Object.entries(json)) {
      const p = data?.usd;
      if (p != null && Number.isFinite(p) && p > 0) prices.set(addr.toLowerCase(), p);
    }
  } catch { /* ignore — caller treats missing price as null */ }
  return prices;
}

/**
 * Discover every ERC-20 token ever held in `address` via tokentx history,
 * check its current on-chain balance, then price it via:
 *   1. Hardcoded POLYGON_KNOWN_TOKENS (stable / BTC / ETH)
 *   2. CoinGecko Polygon token-price batch call for everything else
 *
 * Always seeds with POLYGON_KNOWN_TOKENS so major tokens are never missed.
 */
async function fetchAllTokenBalances(
  address: string,
  prices: { btc: number | null; eth: number | null },
): Promise<TokenHolding[]> {
  // Discover token contracts from ERC-20 history (up to 10 pages = 1 000 txs)
  const tokenHistory = await fetchTxHistory("tokentx", address, { pageSize: 100, maxPages: 10 });

  type TxMeta = { contractAddress?: string; tokenSymbol?: string; tokenName?: string; tokenDecimal?: string };
  const metaMap = new Map<string, { symbol: string; name: string; decimals: number }>();

  for (const tx of tokenHistory.rows) {
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

  // Seed well-known tokens so we always check them even if not in recent history
  const knownByAddr = new Map(POLYGON_KNOWN_TOKENS.map((t) => [t.contractAddress.toLowerCase(), t]));
  for (const kt of POLYGON_KNOWN_TOKENS) {
    const ca = kt.contractAddress.toLowerCase();
    if (!metaMap.has(ca)) metaMap.set(ca, { symbol: kt.symbol, name: kt.name, decimals: kt.decimals });
  }

  const contracts = Array.from(metaMap.keys());

  // Fetch current on-chain balance for each contract (sequential via rate-limiter)
  const withBalance: { contractAddress: string; rawBalance: bigint }[] = [];
  for (const ca of contracts) {
    try {
      const json = await etherscanV2Fetch({
        module: "account", action: "tokenbalance",
        contractaddress: ca, address, tag: "latest",
      });
      const raw = BigInt(String(json?.result ?? "0"));
      if (raw > 0n) withBalance.push({ contractAddress: ca, rawBalance: raw });
    } catch { /* skip */ }
  }

  // Batch-price unknown tokens via CoinGecko
  const unknownAddrs = withBalance
    .map((r) => r.contractAddress)
    .filter((ca) => !knownByAddr.has(ca));
  const cgPrices = await fetchCoinGeckoBatchPrices(unknownAddrs);

  // Build TokenHolding list
  const holdings: TokenHolding[] = [];
  for (const { contractAddress, rawBalance } of withBalance) {
    const meta     = metaMap.get(contractAddress) ?? { symbol: "?", name: "", decimals: 18 };
    const known    = knownByAddr.get(contractAddress);
    const balance  = Number(ethers.formatUnits(rawBalance, meta.decimals));
    let usdValue: number | null = null;

    if (known) {
      usdValue = knownUsd(known.priceKey, balance, prices);
    } else {
      const cgPrice = cgPrices.get(contractAddress);
      if (cgPrice != null) usdValue = balance * cgPrice;
    }

    holdings.push({ contractAddress, symbol: meta.symbol, name: meta.name, decimals: meta.decimals, balance, usdValue });
  }

  return holdings
    .filter((h) => h.balance > 0)
    .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
}

export async function fetchTrackedWalletsLive(wallets: unknown[]) {
  const list = wallets as TrackedWalletLiveInput[];
  let polUsdPrice: number | null = null;
  try {
    polUsdPrice = Number(await getPolUsdPrice());
  } catch {
    polUsdPrice = null;
  }

  const results: WalletLiveEntry[] = [];

  for (const wallet of list) {
    const address = normalizeAddress(wallet.address);
    const displayMode = String(wallet.displayMode || "total_received");
    let valuePol: number | null = null;
    let valueUsd: number | null = null;
    let isPartialUsd = false;
    let tokens: TokenHolding[] | undefined;
    let nfts: NftHolding[] | undefined;

    try {
      if (displayMode === "current_balance") {
        const [balJson, btcPrice, ethPrice] = await Promise.all([
          etherscanV2Fetch({ module: "account", action: "balance", address, tag: "latest" }),
          getBtcUsdPrice().catch((): number | null => null),
          getEthUsdPrice().catch((): number | null => null),
        ]);

        const wei = BigInt(String(balJson?.result ?? "0"));
        valuePol = Number(ethers.formatEther(wei));

        // Discover and price ALL tokens + NFTs in the wallet
        const [allTokens, nftHoldings] = await Promise.all([
          fetchAllTokenBalances(address, { btc: btcPrice, eth: ethPrice }),
          fetchNftHoldings721(address),
        ]);
        tokens = allTokens;
        nfts   = nftHoldings;

        const polUsd = polUsdPrice != null ? valuePol * polUsdPrice : null;
        const tokensUsd = tokens.reduce((s, t) => s + (t.usdValue ?? 0), 0);
        const hasTokenUsd = tokens.some((t) => t.usdValue != null);
        valueUsd =
          polUsd != null || hasTokenUsd
            ? Number(((polUsd ?? 0) + tokensUsd).toFixed(2))
            : null;
      } else {
        // Fetch native POL history + ERC20 token transfers in parallel with price lookups.
        // Rate limiter serialises the Etherscan pages internally; price calls hit CoinGecko.
        const [normalHistory, internalHistory, btcPrice, ethPrice] = await Promise.all([
          fetchTxHistory("txlist", address, { pageSize: 100, maxPages: 100 }),
          fetchTxHistory("txlistinternal", address, { pageSize: 100, maxPages: 100 }),
          getBtcUsdPrice().catch((): number | null => null),
          getEthUsdPrice().catch((): number | null => null),
        ]);
        const tokenHistory = await fetchTxHistory("tokentx", address, { pageSize: 100, maxPages: 100 });

        const nativeSummary = buildMovementSummary(address, normalHistory.rows as unknown[], internalHistory.rows as unknown[]);
        const tokenSummary  = await buildTokenMovementSummary(
          address,
          tokenHistory.rows as unknown[],
          { pol: polUsdPrice, btc: btcPrice, eth: ethPrice },
        );

        const nativePol = displayMode === "total_sent" ? nativeSummary.totalOutPol : nativeSummary.totalInPol;
        const nativeUsd =
          displayMode === "total_sent"
            ? await sumHistoricalPolUsd(nativeSummary.movements, "out")
            : await sumHistoricalPolUsd(nativeSummary.movements, "in");
        const tokenUsd  = displayMode === "total_sent" ? tokenSummary.totalOutUsd : tokenSummary.totalInUsd;

        valuePol = nativePol;
        valueUsd =
          nativeUsd != null || tokenUsd != null
            ? Number(((nativeUsd ?? 0) + (tokenUsd ?? 0)).toFixed(2))
            : null;
        isPartialUsd = nativePol > 0 && nativeUsd == null;

        // Expose per-token breakdown (same TokenHolding shape used by current_balance)
        const relevantTokens = tokenSummary.byToken.filter(
          (t) => (displayMode === "total_sent" ? t.totalOut : t.totalIn) > 0,
        );
        if (relevantTokens.length > 0) {
          tokens = relevantTokens.map((t) => ({
            contractAddress: t.contractAddress,
            symbol:          t.symbol,
            name:            t.name,
            decimals:        t.decimals,
            balance:         displayMode === "total_sent" ? t.totalOut : t.totalIn,
            usdValue:        displayMode === "total_sent" ? t.totalOutUsd : t.totalInUsd,
          }));
        }
      }
    } catch (err) {
      console.error("[wallets-live] wallet fetch error", { walletId: wallet.id, address: String(wallet.address || ""), displayMode, error: String((err as Error)?.message || err) });
      valuePol = null;
      valueUsd = null;
    }

    results.push({
      id: wallet.id ?? null,
      label: String(wallet.label || "").trim() || address,
      address,
      chain: String(wallet.chain || "polygon"),
      assetSymbol: String(wallet.assetSymbol || "POL"),
      explorerBaseUrl: wallet.explorerBaseUrl || "https://polygonscan.com/address",
      isActive: wallet.isActive !== false,
      displayMode,
      valuePol,
      valueUsd,
      ...(isPartialUsd ? { isPartialUsd: true } : {}),
      ...(tokens !== undefined ? { tokens } : {}),
      ...(nfts   !== undefined ? { nfts   } : {}),
    });
  }

  return { apiKeyConfigured: Boolean(getApiKey()), polUsdPrice, wallets: results };
}

export function assertValidTransparencyWalletAddress(raw: unknown): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  return normalizeAddress(s);
}
