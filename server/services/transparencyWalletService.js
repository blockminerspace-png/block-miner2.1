/**
 * Polygon native (POL) transparency wallet helpers.
 * Supports one-off lookups and multi-wallet admin summaries.
 */
import { ethers } from "ethers";
import { getPolUsdPrice } from "../utils/cryptoPrice.js";

const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";
const POLYGON_CHAIN_ID_STR = "137";

function getApiKey() {
  return String(process.env.POLYGONSCAN_API_KEY || "").trim();
}

async function etherscanV2Fetch(params) {
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

async function fetchTxPage(action, address, page, offset) {
  const json = await etherscanV2Fetch({
    module: "account",
    action,
    address,
    startblock: 0,
    endblock: 99999999,
    page,
    offset,
    sort: "desc",
  });
  const list = json?.result;
  if (!Array.isArray(list)) return [];
  return list;
}

function receiptOk(tx) {
  const s = tx?.txreceipt_status;
  if (s === "1" || s === 1 || s === true) return true;
  if (s === "0" || s === 0 || s === false) return false;
  if (tx?.isError === "0" || tx?.isError === 0) return true;
  return true;
}

function weiFromTx(tx) {
  try {
    return BigInt(String(tx?.value || "0"));
  } catch {
    return 0n;
  }
}

function normalizeAddress(raw) {
  const s = String(raw || "").trim();
  if (!s || !ethers.isAddress(s)) {
    const err = new Error("Invalid wallet address.");
    err.code = "INVALID_ADDRESS";
    throw err;
  }
  return ethers.getAddress(s);
}

function buildMovementSummary(address, normal) {
  const addr = address.toLowerCase();
  const movements = [];
  let totalInWei = 0n;
  let totalOutWei = 0n;

  for (const tx of normal) {
    if (!receiptOk(tx)) continue;
    const value = weiFromTx(tx);
    const from = String(tx.from || "").toLowerCase();
    const to = String(tx.to || "").toLowerCase();
    if (value === 0n) continue;

    let direction = null;
    let counterparty = "";
    if (to === addr && from !== addr) {
      direction = "in";
      counterparty = tx.from;
      totalInWei += value;
    } else if (from === addr) {
      direction = "out";
      counterparty = tx.to || "";
      totalOutWei += value;
    }
    if (!direction) continue;

    movements.push({
      kind: "normal",
      hash: tx.hash,
      timeStamp: Number(tx.timeStamp) || 0,
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

/**
 * @param {string} rawAddress
 * @param {{ page?: number, offset?: number }} opts
 */
export async function fetchWalletNativeActivity(rawAddress, opts = {}) {
  const page = Math.min(10, Math.max(1, Number(opts.page) || 1));
  const offset = Math.min(100, Math.max(10, Number(opts.offset) || 50));
  const address = normalizeAddress(rawAddress);
  const normal = await fetchTxPage("txlist", address, page, offset);
  const summary = buildMovementSummary(address, normal);
  let polUsdPrice = null;
  try {
    polUsdPrice = Number(await getPolUsdPrice());
  } catch {
    polUsdPrice = null;
  }

  return {
    address,
    page,
    offset,
    apiKeyConfigured: Boolean(getApiKey()),
    note: "POL native transfers from normal transactions (Polygon). Internal/token movements may appear only on Polygonscan.",
    summary: {
      totalInPol: summary.totalInPol,
      totalOutPol: summary.totalOutPol,
      totalInUsd: polUsdPrice != null ? Number((summary.totalInPol * polUsdPrice).toFixed(2)) : null,
      totalOutUsd: polUsdPrice != null ? Number((summary.totalOutPol * polUsdPrice).toFixed(2)) : null,
      movementCount: summary.movements.length,
      polUsdPrice,
    },
    movements: summary.movements.slice(0, offset),
  };
}

/**
 * @param {Array<{ id?: number, label?: string | null, address: string, chain?: string | null, assetSymbol?: string | null, explorerBaseUrl?: string | null, includeInTotals?: boolean }>} wallets
 * @param {{ offset?: number }} opts
 */
export async function fetchTrackedWalletsSummary(wallets, opts = {}) {
  const offset = Math.min(100, Math.max(10, Number(opts.offset) || 25));
  const activeWallets = Array.isArray(wallets) ? wallets : [];
  let polUsdPrice = null;
  try {
    polUsdPrice = Number(await getPolUsdPrice());
  } catch {
    polUsdPrice = null;
  }

  const perWallet = [];
  let totalInPol = 0;
  let totalOutPol = 0;
  let totalMovementCount = 0;

  for (const wallet of activeWallets) {
    const address = normalizeAddress(wallet.address);
    const normal = await fetchTxPage("txlist", address, 1, offset);
    const summary = buildMovementSummary(address, normal);
    const includeInTotals = wallet.includeInTotals !== false;
    if (includeInTotals) {
      totalInPol += summary.totalInPol;
      totalOutPol += summary.totalOutPol;
      totalMovementCount += summary.movements.length;
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
      },
      movements: summary.movements.slice(0, Math.min(10, offset)),
    });
  }

  return {
    apiKeyConfigured: Boolean(getApiKey()),
    polUsdPrice,
    summary: {
      totalInPol: Number(totalInPol.toFixed(6)),
      totalOutPol: Number(totalOutPol.toFixed(6)),
      totalInUsd: polUsdPrice != null ? Number((totalInPol * polUsdPrice).toFixed(2)) : null,
      totalOutUsd: polUsdPrice != null ? Number((totalOutPol * polUsdPrice).toFixed(2)) : null,
      movementCount: totalMovementCount,
      walletCount: perWallet.length,
    },
    wallets: perWallet,
  };
}

export function assertValidTransparencyWalletAddress(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  return normalizeAddress(s);
}
