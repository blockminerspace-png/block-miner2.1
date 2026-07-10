import type { TFunction } from "i18next";
import type { EIP1193Provider, Hex } from "viem";
import { Interface } from "ethers";
import { BLOCK_MINER_DEPOSIT_ABI } from "../../web3/blockMinerDepositAbi";
import { walletApi } from "./wallet.api";

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isUserRejectedTx(err: unknown): boolean {
  if (!isRecord(err)) return false;
  const code = err.code;
  const msg = typeof err.message === "string" ? err.message : "";
  return code === 4001 || code === "ACTION_REJECTED" || msg.toLowerCase().includes("user rejected");
}

export function looksLikeGasOrProviderIssue(err: unknown): boolean {
  if (isUserRejectedTx(err)) return false;
  const r = isRecord(err) ? err : {};
  const m = String(
    (typeof r.message === "string" ? r.message : "") ||
      (typeof r.shortMessage === "string" ? r.shortMessage : "") ||
      err,
  ).toLowerCase();
  return /gas|estimate|execution reverted|intrinsic|unknown method|failed to submit|invalid request/i.test(m);
}

export const depositContractIface = new Interface(BLOCK_MINER_DEPOSIT_ABI);

export type Eip1193LooseRequest = {
  request: (args: { method: string; params?: readonly unknown[] }) => Promise<unknown>;
};

export function asEip1193Loose(provider: EIP1193Provider): Eip1193LooseRequest {
  return provider as Eip1193LooseRequest;
}

export const WALLETCONNECT_WORDMARK_SRC = "/walletconnect-logo.svg";

export function WalletConnectWordmark({ className, alt }: { className?: string; alt: string }) {
  return (
    <img
      src={WALLETCONNECT_WORDMARK_SRC}
      alt={alt}
      className={className}
      width={111}
      height={12}
      loading="lazy"
      decoding="async"
    />
  );
}

export async function sendPolDepositEip1193({
  getActiveEip1193,
  to,
  valueWei,
  dataHex,
  t,
}: {
  getActiveEip1193: () => EIP1193Provider | null | undefined;
  to: string;
  valueWei: bigint;
  dataHex?: string;
  t: TFunction;
}) {
  const eip1193 = getActiveEip1193();
  if (!eip1193) {
    throw Object.assign(new Error(t("wallet.web3_deposit.no_wallet_for_send")), { code: "NO_EIP1193" });
  }
  const rpc = asEip1193Loose(eip1193);
  const accounts = (await rpc.request({ method: "eth_accounts" })) as string[];
  const from = accounts[0];
  if (!from) {
    throw Object.assign(new Error(t("wallet.web3_deposit.no_wallet_for_send")), { code: "NO_EIP1193" });
  }
  const valueHex = `0x${valueWei.toString(16)}`;
  const txPayload: { from: string; to: string; value: string; data?: string } = { from, to, value: valueHex };
  if (dataHex && typeof dataHex === "string" && dataHex.length > 2) {
    txPayload.data = dataHex;
  }
  try {
    return await rpc.request({ method: "eth_sendTransaction", params: [txPayload] });
  } catch (rawErr: unknown) {
    if (isUserRejectedTx(rawErr)) throw rawErr;
    if (!looksLikeGasOrProviderIssue(rawErr)) throw rawErr;
    let gasLimit = "0x5208";
    try {
      const estBody: { from: string; to: string; valueHex: string; data?: string } = {
        from,
        to,
        valueHex,
        ...(txPayload.data ? { data: txPayload.data } : {}),
      };
      const estRes = await walletApi.postDepositEstimateGas(estBody as Record<string, unknown>);
      if (estRes.data?.ok && estRes.data.gasLimit) {
        gasLimit = estRes.data.gasLimit;
      }
    } catch {
      /* use default */
    }
    return await rpc.request({
      method: "eth_sendTransaction",
      params: [{ ...txPayload, gas: gasLimit as Hex }],
    });
  }
}
