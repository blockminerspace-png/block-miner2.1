import { errMsg } from "../types/tsNarrowing.js";

const DEFAULT_RPC_TIMEOUT_MS = Number(process.env.POLYGON_RPC_TIMEOUT_MS || 4500);

const DEFAULT_RPC_URLS = Object.freeze([
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://poly.api.pocket.network",
  "https://1rpc.io/matic",
  "https://polygon.blockpi.network/v1/rpc/public",
  "https://polygon.meowrpc.com",
  "https://polygon-mainnet.public.blastapi.io",
  "https://rpc.ankr.com/polygon",
  "https://rpc-mainnet.matic.network",
] as const);

function normalizeRpcUrl(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized.length > 0 ? normalized : null;
}

function parseRpcUrls(value: unknown): string[] {
  return String(value || "")
    .split(",")
    .map((entry) => normalizeRpcUrl(entry))
    .filter((u): u is string => Boolean(u));
}

function uniqueRpcUrls(urls: string | readonly string[] | readonly (string | null)[]): string[] {
  const list = Array.isArray(urls) ? [...urls] : [urls];
  return Array.from(
    new Set(
      list
        .map((value) => normalizeRpcUrl(value))
        .filter((u): u is string => Boolean(u)),
    ),
  );
}

export type BuildRpcUrlsInput = {
  primaryUrl?: string;
  additionalUrls?: string[];
  defaultUrls?: readonly string[];
};

function buildRpcUrls({
  primaryUrl = "",
  additionalUrls = [],
  defaultUrls = DEFAULT_RPC_URLS,
}: BuildRpcUrlsInput = {}): string[] {
  return uniqueRpcUrls([primaryUrl, ...additionalUrls, ...defaultUrls]);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_RPC_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

type RpcJsonPayload = {
  error?: { message?: string };
  result?: unknown;
};

async function rpcCallWithFallback(
  rpcUrls: string | readonly string[],
  method: string,
  params: unknown[] = [],
  { timeoutMs = DEFAULT_RPC_TIMEOUT_MS } = {},
): Promise<unknown> {
  let lastError: Error | null = null;
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });

  for (const rpcUrl of uniqueRpcUrls(rpcUrls)) {
    try {
      const response = await fetchWithTimeout(
        rpcUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        },
        timeoutMs,
      );

      if (!response.ok) {
        throw new Error(`RPC request failed (HTTP ${response.status})`);
      }

      const payload = (await response.json()) as RpcJsonPayload;
      if (payload?.error) {
        throw new Error(payload.error.message || "RPC error");
      }

      return payload.result;
    } catch (error: unknown) {
      lastError = new Error(`${rpcUrl}: ${errMsg(error)}`);
    }
  }

  throw lastError ?? new Error("RPC request failed");
}

export {
  DEFAULT_RPC_URLS,
  DEFAULT_RPC_TIMEOUT_MS,
  parseRpcUrls,
  uniqueRpcUrls,
  buildRpcUrls,
  fetchWithTimeout,
  rpcCallWithFallback,
};
