import { ethers } from "ethers";
import type { JsonRpcProvider } from "ethers";
import * as walletModel from "../models/walletModel.js";
import {
  submitCoinExWithdrawal,
  getCoinExWithdrawalStatus,
} from "../services/coinexService.js";
import loggerLib from "../utils/logger.js";
import cron from "node-cron";
import { errMsg } from "../types/tsNarrowing.js";

const logger = loggerLib.child("WithdrawalsCron");

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com";

function withdrawalAutoSendEnabled(): boolean {
  const v = String(process.env.WITHDRAWAL_AUTO_SEND || "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function withdrawalViaCoinExEnabled(): boolean {
  const v = String(process.env.WITHDRAWAL_VIA_COINEX || "").toLowerCase();
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

async function submitViaCoinEx(
  approved: Awaited<ReturnType<typeof walletModel.getApprovedWithdrawalsForAutoSend>>
): Promise<void> {
  logger.info(`CoinEx auto-send: ${approved.length} approved withdrawal(s)`);

  for (const tx of approved) {
    try {
      if (!tx.address) {
        logger.error(`Withdrawal ${tx.id} missing address`);
        continue;
      }
      logger.info(`Submitting CoinEx withdrawal: ${tx.amount} POL → ${tx.address} (id=${tx.id})`);
      const { withdrawId } = await submitCoinExWithdrawal(
        tx.address,
        tx.amount.toString(),
        tx.id
      );
      await walletModel.updateTransactionStatus(tx.id, "processing", `coinex:${withdrawId}`);
      logger.info(`Withdrawal ${tx.id} submitted to CoinEx. withdrawId=${withdrawId}`);
    } catch (err: unknown) {
      logger.error(`CoinEx submit failed for withdrawal ${tx.id} — will retry`, {
        error: errMsg(err),
      });
    }
  }
}

async function sendViaHotWallet(
  approved: Awaited<ReturnType<typeof walletModel.getApprovedWithdrawalsForAutoSend>>
): Promise<void> {
  const wallet = loadHotWallet(new ethers.JsonRpcProvider(POLYGON_RPC_URL));
  if (!wallet) {
    logger.warn("WITHDRAWAL_AUTO_SEND=1 but no valid WITHDRAWAL_PRIVATE_KEY / WITHDRAWAL_MNEMONIC — skip.");
    return;
  }

  logger.info(`Hot-wallet auto-send: ${approved.length} approved withdrawal(s)`);

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

    if (withdrawalViaCoinExEnabled()) {
      await submitViaCoinEx(approved);
    } else {
      await sendViaHotWallet(approved);
    }
  } catch (error: unknown) {
    logger.error("processPendingWithdrawals", { error: errMsg(error) });
  }
}

/** Polling de saques enviados via CoinEx aguardando confirmação on-chain. */
export async function pollCoinExWithdrawals(): Promise<void> {
  if (process.env.NODE_ENV === "test" && !process.env.REAL_RPC_TEST) {
    return;
  }

  try {
    const processing = await walletModel.getProcessingCoinExWithdrawals();
    if (!processing?.length) return;

    for (const tx of processing) {
      try {
        const withdrawId = parseInt(String(tx.txHash).replace("coinex:", ""), 10);
        if (isNaN(withdrawId)) {
          logger.error(`Withdrawal ${tx.id} has invalid coinex marker: ${tx.txHash}`);
          continue;
        }

        const { txHash, status } = await getCoinExWithdrawalStatus(withdrawId);
        logger.info(`CoinEx withdrawId=${withdrawId} (tx ${tx.id}): status=${status} txHash=${txHash ?? "pending"}`);

        if (status === "done" && txHash) {
          await walletModel.updateTransactionStatus(tx.id, "completed", txHash);
          logger.info(`Withdrawal ${tx.id} completed via CoinEx. TxHash: ${txHash}`);
        } else if (status === "cancel") {
          await walletModel.updateTransactionStatus(tx.id, "failed", null);
          logger.warn(`Withdrawal ${tx.id} cancelled by CoinEx — balance restored.`);
        }
      } catch (err: unknown) {
        logger.error(`CoinEx poll failed for withdrawal ${tx.id}`, { error: errMsg(err) });
      }
    }
  } catch (error: unknown) {
    logger.error("pollCoinExWithdrawals", { error: errMsg(error) });
  }
}

export function startWithdrawalMonitoring(): ReturnType<typeof cron.schedule>[] {
  const mode = withdrawalAutoSendEnabled()
    ? withdrawalViaCoinExEnabled()
      ? "AUTO via CoinEx"
      : "AUTO via hot-wallet (approved only)"
    : "manual only (WITHDRAWAL_AUTO_SEND off)";

  logger.info(`Withdrawal cron every 2m — ${mode}`);
  const task = cron.schedule("*/2 * * * *", processPendingWithdrawals);

  const pollTask = cron.schedule("*/3 * * * *", pollCoinExWithdrawals);

  return [task, pollTask];
}
