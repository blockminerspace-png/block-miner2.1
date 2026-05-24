/**
 * Polygon native (POL) transparency wallet helpers.
 * Supports one-off lookups and multi-wallet admin summaries.
 */
import { ethers } from "ethers";
import { getPolUsdPrice, getBtcUsdPrice, getEthUsdPrice } from "../utils/cryptoPrice.js";
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
  timeStamp: number;
  direction: "in" | "out";
  counterparty: unknown;
  valueWei: string;
  valuePol: number;
};

function buildMovementSummary(address: string, normal: unknown[]) {
  const addr = address.toLowerCase();
  const movements: MovementRow[] = [];
  let totalInWei = 0n;
  let totalOutWei = 0n;

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

  movements.sort((a, b) => b.timeStamp - a.timeStamp);

  return {
    movements,
    totalInWei,
    totalOutWei,
    totalInPol: Number(ethers.formatEther(totalInWei)),
    totalOutPol: Number(ethers.formatEther(totalOutWei)),
  };
}

export async function fetchWalletNativeActivity(rawAddress: unknown, opts: TxHistoryOpts = {}) {
  const address = normalizeAddress(rawAddress);
  const history = await fetchTxHistory("txlist", address, opts);
  const normal = history.rows as unknown[];
  const summary = buildMovementSummary(address, normal);
  let polUsdPrice: number | null = null;
  try {
    polUsdPrice = Number(await getPolUsdPrice());
  } catch {
    polUsdPrice = null;
  }

  return {
    address,
    apiKeyConfigured: Boolean(getApiKey()),
    note: history.mayBeTruncated
      ? "POL native transfers from normal transactions (Polygon). The API pagination scan may be capped at 10,000 source records for very busy wallets."
      : "POL native transfers from normal transactions (Polygon).",
    history: {
      scannedPages: history.scannedPages,
      pageSize: history.pageSize,
      sourceRecordCount: normal.length,
      mayBeTruncated: history.mayBeTruncated,
    },
    summary: {
      totalInPol: summary.totalInPol,
      totalOutPol: summary.totalOutPol,
      totalInUsd: polUsdPrice != null ? Number((summary.totalInPol * polUsdPrice).toFixed(2)) : null,
      totalOutUsd: polUsdPrice != null ? Number((summary.totalOutPol * polUsdPrice).toFixed(2)) : null,
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
    const history = await fetchTxHistory("txlist", address, opts);
    const normal = history.rows as unknown[];
    const summary = buildMovementSummary(address, normal);
    const includeInTotals = wallet.includeInTotals !== false;
    if (includeInTotals) {
      totalInWei += summary.totalInWei;
      totalOutWei += summary.totalOutWei;
      totalMovementCount += summary.movements.length;
      historyMayBeTruncated ||= history.mayBeTruncated;
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
        totalInUsd: polUsdPrice != null ? Number((summary.totalInPol * polUsdPrice).toFixed(2)) : null,
        totalOutUsd: polUsdPrice != null ? Number((summary.totalOutPol * polUsdPrice).toFixed(2)) : null,
        movementCount: summary.movements.length,
        historyMayBeTruncated: history.mayBeTruncated,
      },
      history: {
        scannedPages: history.scannedPages,
        pageSize: history.pageSize,
        sourceRecordCount: normal.length,
        mayBeTruncated: history.mayBeTruncated,
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
  tokens?: TokenHolding[];
};

// Polygon mainnet addresses for major DeFi tokens (6 fixed calls, no discovery needed)
const POLYGON_KNOWN_TOKENS = [
  { contractAddress: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", symbol: "USDC",   name: "USD Coin",          decimals: 6,  priceKey: "stable"  },
  { contractAddress: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", symbol: "USDC.e", name: "Bridged USDC",     decimals: 6,  priceKey: "stable"  },
  { contractAddress: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", symbol: "USDT",   name: "Tether USD",       decimals: 6,  priceKey: "stable"  },
  { contractAddress: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", symbol: "DAI",    name: "Dai Stablecoin",   decimals: 18, priceKey: "stable"  },
  { contractAddress: "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", symbol: "WBTC",   name: "Wrapped BTC",      decimals: 8,  priceKey: "btc"     },
  { contractAddress: "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", symbol: "WETH",   name: "Wrapped Ether",    decimals: 18, priceKey: "eth"     },
] as const;

type PriceKey = "stable" | "btc" | "eth";

function resolveTokenUsd(
  priceKey: PriceKey,
  balance: number,
  prices: { btc: number | null; eth: number | null }
): number | null {
  if (priceKey === "stable") return balance;
  if (priceKey === "btc") return prices.btc != null ? balance * prices.btc : null;
  if (priceKey === "eth") return prices.eth != null ? balance * prices.eth : null;
  return null;
}

async function fetchKnownTokenBalances(
  address: string,
  prices: { btc: number | null; eth: number | null }
): Promise<TokenHolding[]> {
  const results = await Promise.all(
    POLYGON_KNOWN_TOKENS.map(async (token) => {
      try {
        const json = await etherscanV2Fetch({
          module: "account",
          action: "tokenbalance",
          contractaddress: token.contractAddress,
          address,
          tag: "latest",
        });
        const raw = BigInt(String(json?.result ?? "0"));
        if (raw === 0n) return null;
        const balance = Number(raw) / 10 ** token.decimals;
        const usdValue = resolveTokenUsd(token.priceKey, balance, prices);
        return { contractAddress: token.contractAddress, symbol: token.symbol, name: token.name, decimals: token.decimals, balance, usdValue } as TokenHolding;
      } catch {
        return null;
      }
    })
  );
  return results.filter((t): t is TokenHolding => t !== null && t.balance > 0)
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
    let tokens: TokenHolding[] | undefined;

    try {
      if (displayMode === "current_balance") {
        const [balJson, btcPrice, ethPrice] = await Promise.all([
          etherscanV2Fetch({ module: "account", action: "balance", address, tag: "latest" }),
          getBtcUsdPrice().catch(() => null as number | null),
          getEthUsdPrice().catch(() => null as number | null),
        ]);

        const wei = BigInt(String(balJson?.result ?? "0"));
        valuePol = Number(ethers.formatEther(wei));

        tokens = await fetchKnownTokenBalances(address, { btc: btcPrice, eth: ethPrice });

        const polUsd = polUsdPrice != null ? valuePol * polUsdPrice : 0;
        const tokensUsd = tokens.reduce((s, t) => s + (t.usdValue ?? 0), 0);
        valueUsd = Number((polUsd + tokensUsd).toFixed(2));
      } else {
        const history = await fetchTxHistory("txlist", address, { pageSize: 100, maxPages: 100 });
        const summary = buildMovementSummary(address, history.rows as unknown[]);
        valuePol = displayMode === "total_sent" ? summary.totalOutPol : summary.totalInPol;
        valueUsd = polUsdPrice != null ? Number((valuePol * polUsdPrice).toFixed(2)) : null;
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
      ...(tokens !== undefined ? { tokens } : {}),
    });
  }

  return { apiKeyConfigured: Boolean(getApiKey()), polUsdPrice, wallets: results };
}

export function assertValidTransparencyWalletAddress(raw: unknown): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  return normalizeAddress(s);
}
