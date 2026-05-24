/**
 * On-chain check-in verification.
 * Primary: Polygonscan API (reliable, no rate-limit issues for low traffic).
 * Fallback: JSON-RPC via AETHER_RPC_URL / POLYGON_RPC_URL.
 */

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
// Etherscan API V2 — suporta todas as chains (Polygon = chainid 137)
const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";
const POLYGON_CHAIN_ID_STR = "137";

export function getCheckinRpcUrl() {
  const aether = process.env.AETHER_RPC_URL?.trim();
  if (aether) return aether;
  return process.env.POLYGON_RPC_URL?.trim() || "https://polygon-bor-rpc.publicnode.com";
}

function getPolygonscanApiKey() {
  return process.env.POLYGONSCAN_API_KEY?.trim() || "";
}

export function assertValidTxHash(txHash) {
  if (!txHash || typeof txHash !== "string" || !TX_HASH_RE.test(txHash.trim())) {
    const err = new Error("Invalid transaction hash.");
    err.code = "INVALID_TX_HASH";
    throw err;
  }
  return txHash.trim();
}

export function normalizeAddr(a) {
  if (!a || typeof a !== "string") return "";
  return a.trim().toLowerCase();
}

// ─── Etherscan API V2 ────────────────────────────────────────────────────────
import { etherscanRateLimitWait } from "../utils/etherscanRateLimiter.js";

async function etherscanV2Fetch(params: Record<string, string>) {
  await etherscanRateLimitWait();

  const apiKey = getPolygonscanApiKey();
  const url = new URL(ETHERSCAN_V2_BASE);
  // V2 requires chainid parameter
  url.searchParams.set("chainid", POLYGON_CHAIN_ID_STR);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (apiKey) url.searchParams.set("apikey", apiKey);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw Object.assign(new Error(`Etherscan V2 HTTP ${res.status}`), { code: "ESCAN_HTTP" });
  const json = await res.json();
  if (json.message === "NOTOK" && json.result !== "No transactions found") {
    throw Object.assign(new Error(json.result || "Etherscan V2 error"), { code: "ESCAN_ERROR" });
  }
  return json;
}

async function etherscanGetTx(txHash) {
  const json = await etherscanV2Fetch({ module: "proxy", action: "eth_getTransactionByHash", txhash: txHash });
  return json.result || null;
}

async function etherscanGetReceipt(txHash) {
  const json = await etherscanV2Fetch({ module: "proxy", action: "eth_getTransactionReceipt", txhash: txHash });
  return json.result || null;
}

// ─── JSON-RPC fallback ───────────────────────────────────────────────────────

export async function rpcCall(method, params) {
  const url = getCheckinRpcUrl();
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(25_000)
  });
  if (!response.ok) {
    const err = new Error(`RPC HTTP ${response.status}`);
    err.code = "RPC_HTTP";
    throw err;
  }
  const payload = await response.json();
  if (payload.error) {
    const err = new Error(payload.error.message || "RPC error");
    err.code = "RPC_ERROR";
    throw err;
  }
  return payload.result;
}

// ─── Unified TX fetch (Polygonscan first, then RPC) ─────────────────────────

async function getTxWithFallback(txHash) {
  if (getPolygonscanApiKey()) {
    try {
      return { tx: await etherscanGetTx(txHash), source: "etherscan" };
    } catch (e: unknown) {
      console.warn(
        "[checkinChain] Etherscan V2 getTx failed, falling back to RPC:",
        e instanceof Error ? e.message : String(e)
      );
    }
  }
  return { tx: await rpcCall("eth_getTransactionByHash", [txHash]), source: "rpc" };
}

async function getReceiptWithFallback(txHash, source) {
  if (source === "etherscan" && getPolygonscanApiKey()) {
    try {
      return await etherscanGetReceipt(txHash);
    } catch (e: unknown) {
      console.warn(
        "[checkinChain] Etherscan V2 getReceipt failed, falling back to RPC:",
        e instanceof Error ? e.message : String(e)
      );
    }
  }
  return rpcCall("eth_getTransactionReceipt", [txHash]);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function receiptSucceeded(receipt) {
  if (!receipt) return false;
  const s = receipt.status;
  if (s === true || s === 1) return true;
  if (typeof s === "string") {
    try {
      return BigInt(s) === 1n;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * @param {{ txHash: string, userWalletLower: string, receiverLower: string, minValueWei: bigint, missingTxBehavior?: 'pending' | 'failed' }} args
 * @returns {{ ok: true, state: 'confirmed' } | { ok: true, state: 'pending' } | { ok: false, state: 'failed', reason: string }}
 */
export async function evaluateCheckinTx({
  txHash,
  userWalletLower,
  receiverLower,
  minValueWei,
  missingTxBehavior = "pending"
}) {
  const { tx, source } = await getTxWithFallback(txHash);
  if (!tx) {
    if (missingTxBehavior === "failed") {
      return {
        ok: false,
        state: "failed",
        reason: "Transaction not found on-chain. Wait a few seconds after sending and try again, or verify the hash."
      };
    }
    return { ok: true, state: "pending" };
  }

  const from = normalizeAddr(tx.from);
  if (from !== userWalletLower) {
    return { ok: false, state: "failed", reason: "Transaction sender does not match your linked wallet." };
  }

  const to = normalizeAddr(tx.to);
  if (!to || to === ZERO_ADDR) {
    return { ok: false, state: "failed", reason: "Invalid transaction (no recipient)." };
  }
  if (to !== receiverLower) {
    return { ok: false, state: "failed", reason: "Payment must go to the official check-in address." };
  }

  let valueWei;
  try {
    valueWei = BigInt(tx.value || "0x0");
  } catch {
    return { ok: false, state: "failed", reason: "Invalid transaction value." };
  }
  if (valueWei < minValueWei) {
    return { ok: false, state: "failed", reason: "Amount sent is below the required check-in payment." };
  }

  const receipt = await getReceiptWithFallback(txHash, source);
  if (!receipt) {
    return { ok: true, state: "pending" };
  }
  if (!receiptSucceeded(receipt)) {
    return { ok: false, state: "failed", reason: "Transaction failed on-chain (reverted or out of gas)." };
  }

  return { ok: true, state: "confirmed" };
}

export function parseCheckinAmountWei() {
  const raw = String(process.env.CHECKIN_AMOUNT_WEI || "10000000000000000").trim();
  try {
    return BigInt(raw);
  } catch {
    return 10_000_000_000_000_000n;
  }
}

/** In-game POL pool check-in (default 0.03 POL). */
export function parseCheckinBalanceAmountWei() {
  const raw = String(process.env.CHECKIN_BALANCE_AMOUNT_WEI || "30000000000000000").trim();
  try {
    return BigInt(raw);
  } catch {
    return 30_000_000_000_000_000n;
  }
}
