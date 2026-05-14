import { ethers } from "ethers";
import type { JsonRpcProvider } from "ethers";
import * as walletModel from "../models/walletModel.js";
import loggerLib from "../utils/logger.js";
import cron from "node-cron";
import { errMsg } from "../types/tsNarrowing.js";

const logger = loggerLib.child("WithdrawalsCron");

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com";

function withdrawalAutoSendEnabled(): boolean {
  const v = String(process.env.WITHDRAWAL_AUTO_SEND || "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function loadHotWallet(provider: JsonRpcProvider): ethers.HDNodeWallet | ethers.Wallet | null {
  const mnemonic = String(process.env.WITHDRAWAL_MNEMONIC || "").trim();
  const rawPk = String(process.env.WITHDRAWAL_PRIVATE_KEY || "").trim();
  if (rawPk && rawPk !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
    const key = rawPk.startsWith("0x") ? rawPk : `0x${rawPk}`;
    try {
      return new ethers.Wallet(key, provider);
    } catch (e: unknown) {
      logger.error("Invalid WITHDRAWAL_PRIVATE_KEY", { error: errMsg(e) });
      return null;
    }
  }
  if (mnemonic) {
    try {
      return ethers.Wallet.fromPhrase(String(mnemonic).trim()).connect(provider);
    } catch (e: unknown) {
      logger.error("Invalid WITHDRAWAL_MNEMONIC", { error: errMsg(e) });
      return null;
    }
  }
  return null;
}

/**
 * Por defeito o envio é MANUAL (admin copia destino, envia POL, marca concluído com txHash).
 * Só corre envio on-chain se WITHDRAWAL_AUTO_SEND=true — e apenas para saques já **approved**.
 * Isto evita marcar saques `pending` como `failed` por falha de RPC/saldo.
 */
export async function processPendingWithdrawals(): Promise<void> {
  if (process.env.NODE_ENV === "test" && !process.env.REAL_RPC_TEST) {
    return;
  }

  if (!withdrawalAutoSendEnabled()) {
    return;
  }

  try {
    const approved = await walletModel.getApprovedWithdrawalsForAutoSend();
    if (!approved?.length) return;

    const wallet = loadHotWallet(new ethers.JsonRpcProvider(POLYGON_RPC_URL));
    if (!wallet) {
      logger.warn("WITHDRAWAL_AUTO_SEND=1 but no valid WITHDRAWAL_PRIVATE_KEY / WITHDRAWAL_MNEMONIC — skip.");
      return;
    }

    logger.info(`Auto-send: ${approved.length} approved withdrawal(s)`);

    for (const tx of approved) {
      try {
        if (!tx.address) {
          logger.error(`Withdrawal ${tx.id} missing address`);
          continue;
        }
        logger.info(`Sending ${tx.amount} POL to ${tx.address} (withdrawal ${tx.id})`);
        const amountWei = ethers.parseEther(tx.amount.toString());
        const transactionResponse = await wallet.sendTransaction({
          to: tx.address,
          value: amountWei,
        });
        const hash = transactionResponse.hash ?? null;
        await walletModel.updateTransactionStatus(tx.id, "completed", hash);
        logger.info(`Withdrawal ${tx.id} completed. TxHash: ${hash}`);
      } catch (err: unknown) {
        const txErr = err as { transaction?: { hash?: string } };
        logger.error(`Auto-send failed for withdrawal ${tx.id}`, {
          error: errMsg(err),
          txHash: txErr.transaction?.hash,
        });
      }
    }
  } catch (error: unknown) {
    logger.error("processPendingWithdrawals", { error: errMsg(error) });
  }
}

export function startWithdrawalMonitoring(): ReturnType<typeof cron.schedule>[] {
  const mode = withdrawalAutoSendEnabled() ? "AUTO (approved only)" : "manual only (WITHDRAWAL_AUTO_SEND off)";
  logger.info(`Withdrawal cron every 2m — ${mode}`);
  const task = cron.schedule("*/2 * * * *", processPendingWithdrawals);
  return [task];
}
