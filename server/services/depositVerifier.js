import { ethers } from "ethers";
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import { getMinDepositPol, getRequiredBlockConfirmations } from "./polygonDepositConfig.js";
import { getSharedPolygonProvider } from "./polygonProvider.js";

const logger = loggerLib.child("DepositVerifier");

/** Enough retries for slow RPC + N block confirmations on Polygon. */
export const DEPOSIT_VERIFY_MAX_ATTEMPTS = 96;
const INTERVAL_MS = 15_000;

/**
 * Verifica um único depósito pendente na blockchain.
 * Credita o valor real da chain — nunca o valor declarado pelo usuário.
 */
async function verifyOnePendingDeposit(tx) {
  const attempts = (tx.verifyAttempts ?? 0) + 1;
  const DEPOSIT_ADDRESS = (process.env.DEPOSIT_WALLET_ADDRESS || "").toLowerCase();

  // Expirou sem confirmação
  if (attempts > DEPOSIT_VERIFY_MAX_ATTEMPTS) {
    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        status: "failed",
        verifyAttempts: attempts,
        rawTx: JSON.stringify({ error: "verification_timeout", attempts })
      }
    });
    logger.warn("Deposit verification timeout", { txId: tx.id, txHash: tx.txHash, userId: tx.userId });
    return;
  }

  const provider = getSharedPolygonProvider();
  const requiredConfs = getRequiredBlockConfirmations();
  const minPol = getMinDepositPol();

  try {
    const receipt = await provider.getTransactionReceipt(tx.txHash);

    // TX ainda não minerada — incrementa tentativas e aguarda
    if (!receipt) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { verifyAttempts: attempts }
      });
      return;
    }

    // TX reverteu na chain
    if (receipt.status !== 1) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          status: "failed",
          verifyAttempts: attempts,
          rawTx: JSON.stringify({ error: "tx_reverted", block: receipt.blockNumber })
        }
      });
      logger.warn("Deposit tx reverted on-chain", { txId: tx.id, txHash: tx.txHash });
      return;
    }

    const onchainTx = await provider.getTransaction(tx.txHash);
    if (!onchainTx) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { verifyAttempts: attempts }
      });
      return;
    }

    // Valida destino
    if (!DEPOSIT_ADDRESS || onchainTx.to?.toLowerCase() !== DEPOSIT_ADDRESS) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          status: "failed",
          verifyAttempts: attempts,
          rawTx: JSON.stringify({ error: "wrong_destination", to: onchainTx.to })
        }
      });
      logger.warn("Deposit wrong destination", { txId: tx.id, to: onchainTx.to, expected: DEPOSIT_ADDRESS });
      return;
    }

    // Valida chain = Polygon Mainnet (137)
    if (Number(onchainTx.chainId ?? 0) !== 137) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          status: "failed",
          verifyAttempts: attempts,
          rawTx: JSON.stringify({ error: "wrong_chain", chainId: String(onchainTx.chainId) })
        }
      });
      return;
    }

    const latestBlock = await provider.getBlockNumber();
    const confCount = latestBlock - Number(receipt.blockNumber) + 1;
    if (confCount < requiredConfs) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { verifyAttempts: attempts }
      });
      return;
    }

    // Valor real da chain (anti-fraud: ignora valor declarado pelo usuário)
    const verifiedAmount = parseFloat(ethers.formatEther(onchainTx.value));
    if (verifiedAmount < minPol) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          status: "failed",
          verifyAttempts: attempts,
          rawTx: JSON.stringify({ error: "amount_too_small", value: verifiedAmount, minPol })
        }
      });
      return;
    }

    // Anti-double-spend: verifica se este txHash já foi creditado
    const duplicate = await prisma.transaction.findFirst({
      where: {
        txHash: tx.txHash,
        status: "completed",
        type: "deposit",
        id: { not: tx.id }
      }
    });
    if (duplicate) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          status: "failed",
          verifyAttempts: attempts,
          rawTx: JSON.stringify({ error: "duplicate_txhash", existingId: duplicate.id })
        }
      });
      logger.error("Duplicate deposit blocked", { txId: tx.id, txHash: tx.txHash, existingId: duplicate.id });
      return;
    }

    // Credita valor verificado em transação atômica
    await prisma.$transaction(async (ptx) => {
      await ptx.transaction.update({
        where: { id: tx.id },
        data: {
          status: "completed",
          amount: verifiedAmount.toString(),
          fromAddress: onchainTx.from?.toLowerCase() || null,
          completedAt: new Date(),
          verifyAttempts: attempts,
          rawTx: JSON.stringify({ verifiedAmount, block: receipt.blockNumber, from: onchainTx.from })
        }
      });
      await ptx.user.update({
        where: { id: tx.userId },
        data: { polBalance: { increment: verifiedAmount } }
      });
    });

    // Sync runtime balance (sem-crash se engine não estiver disponível)
    try {
      const { applyUserBalanceDelta } = await import("../src/runtime/miningRuntime.js");
      applyUserBalanceDelta(tx.userId, verifiedAmount);
    } catch (_) {}

    // Notificação + socket em tempo real
    try {
      const { getMiningEngine } = await import("../src/miningEngineInstance.js");
      const { createNotification } = await import("../controllers/notificationController.js");
      const engine = getMiningEngine();
      await createNotification({
        userId: tx.userId,
        title: "Depósito Confirmado!",
        message: `Seu depósito de ${verifiedAmount.toFixed(4)} POL foi verificado na blockchain e creditado.`,
        type: "success",
        io: engine?.io ?? null
      });
      if (engine?.io) {
        engine.io
          .to(`user:${tx.userId}`)
          .emit("wallet:deposit_confirmed", {
            amount: verifiedAmount,
            txHash: tx.txHash,
            txId: tx.id
          });
      }
    } catch (_) {}

    logger.info("Deposit credited", {
      userId: tx.userId,
      txId: tx.id,
      txHash: tx.txHash,
      amount: verifiedAmount
    });

  } catch (err) {
    // Erro temporário (RPC timeout, rede) — incrementa tentativas para retry
    await prisma.transaction
      .update({ where: { id: tx.id }, data: { verifyAttempts: attempts } })
      .catch(() => {});
    logger.warn("Deposit verify error (will retry)", {
      txId: tx.id,
      attempt: attempts,
      error: err.message
    });
  }
}

/**
 * Busca todos os depósitos pending_verification e verifica em paralelo.
 */
export async function runDepositVerifier() {
  try {
    const pending = await prisma.transaction.findMany({
      where: { type: "deposit", status: "pending_verification" },
      orderBy: { createdAt: "asc" },
      take: 50
    });
    if (pending.length > 0) {
      await Promise.allSettled(pending.map(verifyOnePendingDeposit));
    }
  } catch (err) {
    logger.error("DepositVerifier run error", { error: err.message });
  }
}

let _interval = null;

/**
 * Inicia o loop de verificação de depósitos (chamar uma vez no bootstrap do servidor).
 */
export function startDepositVerifier() {
  if (_interval) return;
  runDepositVerifier().catch(() => {});
  _interval = setInterval(() => runDepositVerifier().catch(() => {}), INTERVAL_MS);
  logger.info(
    `DepositVerifier started — interval ${INTERVAL_MS}ms, max ${DEPOSIT_VERIFY_MAX_ATTEMPTS} attempts (~${(DEPOSIT_VERIFY_MAX_ATTEMPTS * INTERVAL_MS) / 60_000}min)`
  );
}

export default { startDepositVerifier, runDepositVerifier };
