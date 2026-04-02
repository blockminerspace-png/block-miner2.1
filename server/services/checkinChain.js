/**
 * On-chain check-in verification (JSON-RPC).
 * Uses AETHER_RPC_URL when set, otherwise POLYGON_RPC_URL (same stack as Aether-style gateways).
 */

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

export function getCheckinRpcUrl() {
  const aether = process.env.AETHER_RPC_URL?.trim();
  if (aether) return aether;
  return process.env.POLYGON_RPC_URL?.trim() || "https://polygon-rpc.com";
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
 * @returns {{ ok: true, state: 'confirmed' } | { ok: true, state: 'pending' } | { ok: false, state: 'failed', reason: string }}
 */
export async function evaluateCheckinTx({
  txHash,
  userWalletLower,
  receiverLower,
  minValueWei
}) {
  const tx = await rpcCall("eth_getTransactionByHash", [txHash]);
  if (!tx) {
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

  const receipt = await rpcCall("eth_getTransactionReceipt", [txHash]);
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
