import crypto from "node:crypto";

const COINEX_BASE_URL = "https://api.coinex.com";

function coinexAccessId(): string {
  const id = String(process.env.COINEX_ACCESS_ID || "").trim();
  if (!id) throw new Error("COINEX_ACCESS_ID não configurado");
  return id;
}

function coinexSecret(): string {
  const key = String(process.env.COINEX_SECRET_KEY || "").trim();
  if (!key) throw new Error("COINEX_SECRET_KEY não configurado");
  return key;
}

function buildHeaders(
  method: string,
  path: string,
  queryString: string,
  body: string
): Record<string, string> {
  const timestampMs = String(Date.now());
  // CoinEx v2: concatenate without separators — Method + Path + Params + Timestamp
  // For GET: Params = query string; for POST: Params = JSON body
  const params = queryString || body;
  const message = `${method}${path}${params}${timestampMs}`;
  const signature = crypto
    .createHmac("sha256", coinexSecret())
    .update(message)
    .digest("hex");
  return {
    "Content-Type": "application/json",
    "X-COINEX-KEY": coinexAccessId(),
    "X-COINEX-SIGN": signature,
    "X-COINEX-TIMESTAMP": timestampMs,
  };
}

async function coinexFetch(
  method: "GET" | "POST",
  path: string,
  queryString: string,
  body: string
): Promise<unknown> {
  const url =
    queryString
      ? `${COINEX_BASE_URL}${path}?${queryString}`
      : `${COINEX_BASE_URL}${path}`;

  const headers = buildHeaders(method, path, queryString, body);

  const res = await fetch(url, {
    method,
    headers,
    body: method === "POST" ? body : undefined,
    signal: AbortSignal.timeout(15_000),
  });

  const json = (await res.json()) as { code: number; message: string; data: unknown };

  if (json.code !== 0) {
    throw new Error(`CoinEx API error ${json.code}: ${json.message}`);
  }

  return json.data;
}

export interface CoinExWithdrawResult {
  withdrawId: number;
}

export interface CoinExWithdrawStatus {
  txHash: string | null;
  status: string;
}

export async function submitCoinExWithdrawal(
  address: string,
  amountStr: string,
  transactionId: number
): Promise<CoinExWithdrawResult> {
  const path = "/v2/assets/withdraw";
  const bodyObj = {
    ccy: "POL",
    chain: "MATIC",
    to_address: address,
    amount: amountStr,
    remark: `BlockMiner #${transactionId}`,
  };
  const body = JSON.stringify(bodyObj);

  const data = (await coinexFetch("POST", path, "", body)) as {
    withdraw_id: number;
  };

  return { withdrawId: data.withdraw_id };
}

export async function getCoinExWithdrawalStatus(
  withdrawId: number
): Promise<CoinExWithdrawStatus> {
  const path = "/v2/assets/withdraw";
  const queryString = `withdraw_id=${withdrawId}`;

  const data = (await coinexFetch("GET", path, queryString, "")) as {
    tx_hash: string;
    status: string;
  };

  const txHash =
    data.tx_hash && data.tx_hash.startsWith("0x") ? data.tx_hash : null;

  return { txHash, status: data.status };
}
