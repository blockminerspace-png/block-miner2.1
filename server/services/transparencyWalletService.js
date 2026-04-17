/**
 * Polygon native (POL) movement summary for transparency admin.
 * Uses Etherscan API V2 (same as checkinChain) — set POLYGONSCAN_API_KEY for reliable quotas.
 */
import { ethers } from "ethers";

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

/**
 * @param {string} checksummedOrLower
 * @param {{ page?: number, offset?: number }} opts
 */
export async function fetchWalletNativeActivity(checksummedOrLower, opts = {}) {
  const page = Math.min(10, Math.max(1, Number(opts.page) || 1));
  const offset = Math.min(100, Math.max(10, Number(opts.offset) || 50));

  const addr = String(checksummedOrLower || "").trim().toLowerCase();
  if (!addr || !ethers.isAddress(addr)) {
    const err = new Error("Invalid wallet address.");
    err.code = "INVALID_ADDRESS";
    throw err;
  }

  // Normal transactions only (avoids double-count with internal transfers for the same flow).
  const normal = await fetchTxPage("txlist", addr, page, offset);

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
    address: ethers.getAddress(addr),
    page,
    offset,
    apiKeyConfigured: Boolean(getApiKey()),
    note: "POL native transfers from normal transactions (Polygon). Internal/token movements may appear only on Polygonscan.",
    summary: {
      totalInPol: Number(ethers.formatEther(totalInWei)),
      totalOutPol: Number(ethers.formatEther(totalOutWei)),
      movementCount: movements.length,
    },
    movements: movements.slice(0, offset),
  };
}

export function assertValidTransparencyWalletAddress(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (!ethers.isAddress(s)) {
    const err = new Error("Invalid wallet address.");
    err.code = "INVALID_ADDRESS";
    throw err;
  }
  return ethers.getAddress(s);
}
