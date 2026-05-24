/**
 * Check-in on-chain destination and transaction validation (treasury transfer or contract call).
 */
import { Interface } from "ethers";
import {
  evaluateCheckinTx,
  normalizeAddr,
  rpcCall
} from "../../services/checkinChain.js";
import { etherscanRateLimitWait } from "../../utils/etherscanRateLimiter.js";

const ZERO = "0x0000000000000000000000000000000000000000";
const CHECKIN_IFACE = new Interface(["function checkIn() payable"]);
const CHECK_IN_SELECTOR = CHECKIN_IFACE.getFunction("checkIn")!.selector.toLowerCase();

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

export function getExpectedCheckinChainId(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CHECKIN_CHAIN_ID ?? env.POLYGON_CHAIN_ID ?? "137";
  const n = Number(String(raw).trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 137;
}

export function resolveCheckinContractAddress(env: NodeJS.ProcessEnv = process.env): string {
  const c = String(env.CHECKIN_CONTRACT_ADDRESS ?? "").trim();
  if (!c) return "";
  const lower = normalizeAddr(c);
  if (!lower || lower === ZERO) return "";
  return c;
}

export function hasCheckinOnChainDestination(env: NodeJS.ProcessEnv = process.env): boolean {
  if (resolveCheckinContractAddress(env)) return true;
  for (const key of ["CHECKIN_RECEIVER", "DEPOSIT_WALLET_ADDRESS"] as const) {
    const r = String(env[key] ?? "").trim();
    if (r && normalizeAddr(r) !== ZERO) return true;
  }
  return false;
}

function receiptSucceeded(receipt: { status?: unknown } | null): boolean {
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

async function getTxWithFallback(txHash: string) {
  const apiKey = String(process.env.POLYGONSCAN_API_KEY ?? "").trim();
  if (apiKey) {
    try {
      await etherscanRateLimitWait();
      const scanUrl = new URL("https://api.etherscan.io/v2/api");
      scanUrl.searchParams.set("chainid", String(getExpectedCheckinChainId()));
      scanUrl.searchParams.set("module", "proxy");
      scanUrl.searchParams.set("action", "eth_getTransactionByHash");
      scanUrl.searchParams.set("txhash", txHash);
      scanUrl.searchParams.set("apikey", apiKey);
      const res = await fetch(scanUrl.toString(), { signal: AbortSignal.timeout(20_000) });
      if (res.ok) {
        const json = (await res.json()) as { result?: unknown };
        if (json.result) return { tx: json.result as Record<string, unknown>, source: "etherscan" as const };
      }
    } catch {
      /* fall through to RPC */
    }
  }
  const tx = await rpcCall("eth_getTransactionByHash", [txHash]);
  return { tx: tx as Record<string, unknown> | null, source: "rpc" as const };
}

async function getReceiptWithFallback(txHash: string, source: "etherscan" | "rpc") {
  const apiKey = String(process.env.POLYGONSCAN_API_KEY ?? "").trim();
  if (source === "etherscan" && apiKey) {
    try {
      await etherscanRateLimitWait();
      const scanUrl = new URL("https://api.etherscan.io/v2/api");
      scanUrl.searchParams.set("chainid", String(getExpectedCheckinChainId()));
      scanUrl.searchParams.set("module", "proxy");
      scanUrl.searchParams.set("action", "eth_getTransactionReceipt");
      scanUrl.searchParams.set("txhash", txHash);
      scanUrl.searchParams.set("apikey", apiKey);
      const res = await fetch(scanUrl.toString(), { signal: AbortSignal.timeout(20_000) });
      if (res.ok) {
        const json = (await res.json()) as { result?: unknown };
        if (json.result) return json.result as { status?: unknown };
      }
    } catch {
      /* fall through */
    }
  }
  return rpcCall("eth_getTransactionReceipt", [txHash]) as Promise<{ status?: unknown } | null>;
}

type EvalResult =
  | { ok: true; state: "confirmed" }
  | { ok: true; state: "pending" }
  | { ok: false; state: "failed"; reason: string };

async function evaluateCheckinContractTx({
  txHash,
  userWalletLower,
  contractLower,
  minValueWei,
  missingTxBehavior = "pending"
}: {
  txHash: string;
  userWalletLower: string;
  contractLower: string;
  minValueWei: bigint;
  missingTxBehavior?: "pending" | "failed";
}): Promise<EvalResult> {
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

  const from = normalizeAddr(String(tx.from ?? ""));
  if (from !== userWalletLower) {
    return { ok: false, state: "failed", reason: "Transaction sender does not match your linked wallet." };
  }

  const to = normalizeAddr(String(tx.to ?? ""));
  if (!to || to === ZERO) {
    return { ok: false, state: "failed", reason: "Invalid transaction (no contract recipient)." };
  }
  if (to !== contractLower) {
    return { ok: false, state: "failed", reason: "Transaction must call the official check-in contract." };
  }

  const inputRaw = typeof tx.input === "string" ? tx.input : typeof tx.data === "string" ? tx.data : "";
  const input = inputRaw.toLowerCase();
  if (!input.startsWith(CHECK_IN_SELECTOR)) {
    return {
      ok: false,
      state: "failed",
      reason: "Transaction does not call the check-in contract method."
    };
  }

  let valueWei: bigint;
  try {
    valueWei = BigInt(String(tx.value ?? "0x0"));
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

/**
 * Validates a wallet check-in payment (native treasury transfer or `checkIn()` on CHECKIN_CONTRACT_ADDRESS).
 */
export async function evaluateCheckinPayment({
  txHash,
  userWalletLower,
  receiverLower,
  minValueWei,
  missingTxBehavior = "pending"
}: {
  txHash: string;
  userWalletLower: string;
  receiverLower: string;
  minValueWei: bigint;
  missingTxBehavior?: "pending" | "failed";
}): Promise<EvalResult> {
  const contract = resolveCheckinContractAddress();
  if (contract) {
    return evaluateCheckinContractTx({
      txHash,
      userWalletLower,
      contractLower: normalizeAddr(contract),
      minValueWei,
      missingTxBehavior
    });
  }
  const treasuryResult = await evaluateCheckinTx({
    txHash,
    userWalletLower,
    receiverLower,
    minValueWei,
    missingTxBehavior
  });
  return treasuryResult as EvalResult;
}

export function assertValidWalletAddress(wallet: string): string {
  const w = String(wallet ?? "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(w)) {
    const err = new Error("Invalid wallet address.");
    (err as Error & { code: string }).code = "INVALID_WALLET_ADDRESS";
    throw err;
  }
  return w;
}

export function parseOptionalChainIdFromBody(body: unknown): number | null {
  const b = body as Record<string, unknown> | null | undefined;
  const raw = b?.chainId;
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export function isValidTxHashFormat(txHash: string): boolean {
  return TX_HASH_RE.test(txHash.trim());
}
