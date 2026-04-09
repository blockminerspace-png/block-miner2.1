import { verifyMessage } from "ethers";
import walletModel from "../models/walletModel.js";
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import { runDepositVerifier, DEPOSIT_VERIFY_MAX_ATTEMPTS } from "../services/depositVerifier.js";
import { wakeUpScanner } from "../cron/depositsCron.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { getPolUsdPrice } from "../utils/cryptoPrice.js";
import { getMinDepositPol, getRequiredBlockConfirmations } from "../services/polygonDepositConfig.js";
import { getSharedPolygonProvider } from "../services/polygonProvider.js";

/** Minimum POL for a withdrawal request. */
export const WITHDRAW_MIN_POL = 10;

/**
 * Business days (in hours) expected before a withdrawal is processed.
 * This is shown to users and validated nowhere else — it is purely informational.
 */
export const WITHDRAW_PROCESSING_HOURS = 72;

const logger = loggerLib.child("WalletController");

export async function getBalance(req, res) {
  try {
    const balance = await walletModel.getUserBalance(req.user.id);
    const depositAddress = process.env.DEPOSIT_WALLET_ADDRESS || null;
    res.json({
      ok: true,
      ...balance,
      depositAddress,
      minDepositPol: getMinDepositPol(),
      blockConfirmations: getRequiredBlockConfirmations(),
      depositVerifyMaxAttempts: DEPOSIT_VERIFY_MAX_ATTEMPTS
    });
  } catch (error) {
    logger.error("Error getting balance", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to get balance." });
  }
}

export async function getDeposits(req, res) {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId: req.user.id, type: "deposit" },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    const normalized = transactions.map((tx) => ({
      ...tx,
      amount: Number(tx.amount),
      fee: tx.fee != null ? Number(tx.fee) : null
    }));
    res.json({ ok: true, deposits: normalized });
  } catch (error) {
    logger.error("Error getting deposits", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to get deposits." });
  }
}

export async function getTransactions(req, res) {
  try {
    const transactions = await walletModel.getTransactions(req.user.id);
    // Converter Decimal do Prisma para número JS para evitar erros no frontend
    const normalized = transactions.map(tx => ({
      ...tx,
      amount: Number(tx.amount),
      fee: tx.fee != null ? Number(tx.fee) : null
    }));
    res.json({ ok: true, transactions: normalized });
  } catch (error) {
    logger.error("Error getting transactions", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to get transactions." });
  }
}

export async function requestDeposit(req, res) {
  try {
    const { amount, txHash } = req.body;
    if (!amount || !txHash) {
      return res.status(400).json({ ok: false, message: "Amount and TX Hash required." });
    }
    const parsedAmount = parseFloat(amount);
    const minD = getMinDepositPol();
    if (isNaN(parsedAmount) || parsedAmount < minD) {
      return res.status(400).json({
        ok: false,
        message: `Minimum deposit is ${minD} POL.`
      });
    }
    await walletModel.createDepositRequest(req.user.id, amount, txHash);
    res.json({ ok: true, message: "Deposit completed and confirmed." });
  } catch (error) {
    logger.error("Error requesting deposit", { error: error.message });
    res.status(400).json({ ok: false, message: error.message || "Unable to complete deposit." });
  }
}

export async function updateAddress(req, res) {
  try {
    const { walletAddress, signature } = req.body;
    if (!walletAddress || !signature) {
      return res.status(400).json({ ok: false, message: "Wallet address and signature are required." });
    }

    // Verify signature to prevent fraud/spoofing
    const message = `Verify wallet ownership for Block Miner: ${walletAddress}`;
    const recoveredAddress = verifyMessage(message, signature);

    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(401).json({ ok: false, message: "Invalid wallet signature. Ownership not verified." });
    }

    await walletModel.saveWalletAddress(req.user.id, walletAddress);
    res.json({ ok: true, message: "Wallet verified and linked successfully." });
  } catch (error) {
    logger.error("Error updating address", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to verify wallet address." });
  }
}

export async function requestWithdrawal(req, res) {
  try {
    const { amount, address } = req.body;
    if (!amount || !address) {
      return res.status(400).json({ ok: false, message: "Amount and address are required." });
    }

    // Validate Ethereum/Polygon address format
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return res.status(400).json({ ok: false, message: "Invalid wallet address format." });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < WITHDRAW_MIN_POL) {
      return res.status(400).json({
        ok: false,
        message: `Minimum withdrawal is ${WITHDRAW_MIN_POL} POL.`
      });
    }

    const transaction = await walletModel.createWithdrawal(req.user.id, parsedAmount, address);
    res.json({
      ok: true,
      message: `Withdrawal request submitted. Processing time: up to ${WITHDRAW_PROCESSING_HOURS} business hours.`,
      transaction
    });
  } catch (error) {
    logger.error("Error requesting withdrawal", { error: error.message });
    if (error.message === "Pending withdrawal exists") {
      return res.status(409).json({ ok: false, message: error.message });
    }
    res.status(400).json({ ok: false, message: error.message || "Unable to request withdrawal." });
  }
}

/**
 * Registra um depósito para verificação assíncrona na blockchain.
 * O usuário envia o txHash e pode fechar a página — o sistema verifica em background.
 */
export async function submitDeposit(req, res) {
  try {
    const userId = req.user.id;
    const { txHash, claimedAmount } = req.body;

    // Valida formato do txHash
    if (!txHash || typeof txHash !== "string") {
      return res.status(400).json({ ok: false, message: "Hash da transação obrigatório." });
    }
    const normalizedHash = txHash.trim().toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(normalizedHash)) {
      return res.status(400).json({
        ok: false,
        message: "Hash inválido. Formato esperado: 0x seguido de 64 caracteres hexadecimais."
      });
    }

    // Valor declarado é apenas referência — o crédito real vem da chain
    let parsedClaimed = 0;
    if (claimedAmount !== undefined && claimedAmount !== "") {
      parsedClaimed = parseFloat(claimedAmount);
      if (isNaN(parsedClaimed) || parsedClaimed < 0) {
        return res.status(400).json({ ok: false, message: "Valor inválido." });
      }
      const minD = getMinDepositPol();
      if (parsedClaimed > 0 && parsedClaimed < minD) {
        return res.status(400).json({
          ok: false,
          message: `Depósito mínimo é ${minD} POL.`
        });
      }
    }

    // Verifica se esse hash já existe para este usuário
    const existing = await prisma.transaction.findFirst({
      where: { txHash: normalizedHash, userId, type: "deposit" }
    });
    if (existing) {
      if (existing.status === "completed") {
        return res.status(409).json({
          ok: false,
          code: "ALREADY_CREDITED",
          message: "Esta transação já foi processada e creditada."
        });
      }
      if (existing.status === "pending_verification") {
        return res.json({
          ok: true,
          deposit: { id: existing.id, status: "pending_verification" },
          message: "Depósito já está em verificação."
        });
      }
      if (existing.status === "failed") {
        const failReason = (() => {
          try { return JSON.parse(existing.rawTx || "{}").error; } catch { return null; }
        })();
        return res.status(409).json({
          ok: false,
          code: "VERIFICATION_FAILED",
          failReason,
          message: "A verificação deste depósito falhou. Abra um ticket de suporte se o valor não foi creditado."
        });
      }
    }

    // Anti-fraude: verifica se outro usuário já reivindicou este hash
    const otherClaim = await prisma.transaction.findFirst({
      where: {
        txHash: normalizedHash,
        type: "deposit",
        status: { in: ["completed", "pending_verification"] },
        userId: { not: userId }
      }
    });
    if (otherClaim) {
      logger.warn("Deposit hash claimed by another user", { userId, txHash: normalizedHash });
      return res.status(409).json({
        ok: false,
        code: "HASH_CLAIMED",
        message: "Esta transação já foi reivindicada por outra conta."
      });
    }

    // Registra depósito como pending_verification
    const deposit = await prisma.transaction.create({
      data: {
        userId,
        type: "deposit",
        amount: parsedClaimed > 0 ? parsedClaimed.toString() : "0",
        txHash: normalizedHash,
        status: "pending_verification",
        verifyAttempts: 0
      }
    });

    // Dispara verificação assíncrona imediatamente (não bloqueia resposta)
    runDepositVerifier().catch(() => {});
    wakeUpScanner();

    logger.info("Deposit submitted for async verification", { userId, txHash: normalizedHash });
    return res.json({
      ok: true,
      deposit: { id: deposit.id, txHash: normalizedHash, status: "pending_verification" },
      message: "Depósito enviado! Verificando na blockchain em segundo plano. Você pode fechar esta página com segurança."
    });
  } catch (err) {
    logger.error("submitDeposit error", { error: err.message });
    return res.status(500).json({ ok: false, message: "Erro ao registrar depósito." });
  }
}

/**
 * Retorna os depósitos recentes do usuário (pending, completed, failed).
 * Usado para poll do frontend enquanto o usuário aguarda confirmação.
 */
export async function getPendingDeposits(req, res) {
  try {
    const deposits = await prisma.transaction.findMany({
      where: {
        userId: req.user.id,
        type: "deposit",
        status: { in: ["pending_verification", "completed", "failed"] }
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        txHash: true,
        amount: true,
        status: true,
        verifyAttempts: true,
        createdAt: true,
        completedAt: true,
        rawTx: true
      }
    });

    const requiredConfs = getRequiredBlockConfirmations();
    const provider = getSharedPolygonProvider();
    let latestBlock = null;
    try {
      latestBlock = await provider.getBlockNumber();
    } catch {
      latestBlock = null;
    }

    const mapped = await Promise.all(
      deposits.map(async (d) => {
        const failReason =
          d.status === "failed" && d.rawTx
            ? (() => {
                try {
                  return JSON.parse(d.rawTx).error;
                } catch {
                  return null;
                }
              })()
            : null;

        let confirmationsCurrent = null;
        let txMined = null;
        let txReverted = null;
        if (d.status === "pending_verification" && d.txHash && latestBlock != null) {
          try {
            const receipt = await provider.getTransactionReceipt(d.txHash);
            if (!receipt) {
              confirmationsCurrent = 0;
              txMined = false;
            } else if (receipt.status !== 1) {
              confirmationsCurrent = 0;
              txMined = true;
              txReverted = true;
            } else {
              txMined = true;
              txReverted = false;
              confirmationsCurrent = Math.max(0, latestBlock - Number(receipt.blockNumber) + 1);
            }
          } catch {
            confirmationsCurrent = null;
          }
        }

        return {
          id: d.id,
          txHash: d.txHash,
          amount: Number(d.amount),
          status: d.status,
          verifyAttempts: d.verifyAttempts,
          createdAt: d.createdAt,
          completedAt: d.completedAt,
          failReason,
          confirmationsCurrent,
          confirmationsRequired: requiredConfs,
          txMined,
          txReverted,
          verifyMaxAttempts: DEPOSIT_VERIFY_MAX_ATTEMPTS
        };
      })
    );

    return res.json({ ok: true, deposits: mapped });
  } catch (err) {
    logger.error("getPendingDeposits error", { error: err.message });
    return res.status(500).json({ ok: false, message: "Erro ao buscar depósitos." });
  }
}

const VALID_MINING_PAYOUT_MODES = new Set(["pol"]);

/** GET /api/wallet/pol-usd — server-side CoinGecko (avoids browser CORS). */
export async function getWalletPolUsdPrice(req, res) {
  try {
    const priceUsd = await getPolUsdPrice();
    return res.json({ ok: true, priceUsd });
  } catch (err) {
    logger.warn("getWalletPolUsdPrice", { message: err.message });
    return res.json({ ok: false, priceUsd: null });
  }
}

/** Mining payout is POL-only. BLK mining mode was removed. */
export async function setMiningPayoutMode(req, res) {
  try {
    const raw = String(req.body?.mode ?? "").toLowerCase().trim();
    if (!VALID_MINING_PAYOUT_MODES.has(raw)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid mode. Only 'pol' is supported."
      });
    }
    await prisma.user.update({
      where: { id: req.user.id },
      data: { miningPayoutMode: raw }
    });
    getMiningEngine()?.reloadMinerProfile(req.user.id).catch(() => {});
    return res.json({ ok: true, miningPayoutMode: raw });
  } catch (err) {
    logger.error("setMiningPayoutMode error", { error: err.message });
    return res.status(500).json({ ok: false, message: "Não foi possível atualizar a preferência." });
  }
}
