import type { Request, Response } from "express";
import { verifyMessage } from "ethers";
import walletModel from "../models/walletModel.js";
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import { runDepositVerifier, DEPOSIT_VERIFY_MAX_ATTEMPTS } from "../services/depositVerifier.js";
import { wakeUpScanner } from "../cron/depositsCron.js";
import { enqueueDepositPolygonScan } from "../jobs/blockminerQueue.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { getPolUsdPrice } from "../utils/cryptoPrice.js";
import { getMinDepositPol, getRequiredBlockConfirmations } from "../services/polygonDepositConfig.js";
import { getSharedPolygonProvider } from "../services/polygonProvider.js";
import {
  isBtcpayComingSoon,
  isBtcpayInvoiceFlowEnabled,
  listBtcpayMissingEnvKeys
} from "../services/btcpayService.js";
import {
  getPolygonHdMinDepositPol,
  isPolygonHdDepositEnabled,
  isPolygonHdFeatureFlagged,
  listPolygonHdMissingEnvKeys
} from "../services/polygonHdConfig.js";
import { createAuditLogBestEffort } from "../models/auditLogModel.js";
import { getRequestIp } from "../utils/clientIp.js";
import {
  allocatePolygonHdAddress,
  allocatePolygonHdAddressRemote
} from "../services/polygonHdWallet.js";
import { readErrorCode, readErrorMessage, requireSessionUser } from "./controllerHttpStatusError.js";

/** Minimum POL for a withdrawal request. */
export const WITHDRAW_MIN_POL = 10;

/**
 * Business days (in hours) expected before a withdrawal is processed.
 * This is shown to users and validated nowhere else — it is purely informational.
 */
export const WITHDRAW_PROCESSING_HOURS = 72;

const logger = loggerLib.child("WalletController");

export async function getBalance(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const balance = await walletModel.getUserBalance(user.id);
    const depositAddress = process.env.DEPOSIT_WALLET_ADDRESS || null;
    const depositContractAddress = (process.env.SMART_CONTRACT_ADDRESS || "").trim() || null;
    const comingSoon = isBtcpayComingSoon();
    const btcpayMissing = comingSoon ? [] : listBtcpayMissingEnvKeys();
    res.json({
      ok: true,
      ...balance,
      depositAddress,
      depositContractAddress,
      minDepositPol: getMinDepositPol(),
      blockConfirmations: getRequiredBlockConfirmations(),
      depositVerifyMaxAttempts: DEPOSIT_VERIFY_MAX_ATTEMPTS,
      btcpayDepositEnabled: isBtcpayInvoiceFlowEnabled(),
      btcpayDepositComingSoon: comingSoon,
      btcpayDepositMissingEnvKeys: btcpayMissing,
      polygonHdDepositEnabled: isPolygonHdDepositEnabled(),
      polygonHdDepositFeatureVisible: isPolygonHdFeatureFlagged(),
      polygonHdDepositMissingEnvKeys: listPolygonHdMissingEnvKeys(),
      polygonHdMinDepositPol: getPolygonHdMinDepositPol()
    });
  } catch (error: unknown) {
    logger.error("Error getting balance", { error: readErrorMessage(error) });
    res.status(500).json({ ok: false, message: "Unable to get balance." });
  }
}

/** GET /api/wallet/deposit/hd-address — custodial Polygon HD deposit address for the authenticated user. */
export async function getPolygonHdDepositAddress(req: Request, res: Response) {
  try {
    if (!isPolygonHdDepositEnabled()) {
      return res.status(503).json({
        ok: false,
        message: "Polygon HD deposit is not enabled on this server."
      });
    }
    const user = requireSessionUser(req, res);
    if (!user) return;
    const userId = user.id;
    const remoteUrl = (process.env.PHD_SERVICE_URL || "").trim();
    if (remoteUrl) {
      const allocated = await allocatePolygonHdAddressRemote(userId);
      return res.json({ ok: true, ...allocated });
    }
    const row = await allocatePolygonHdAddress(userId);
    return res.json({
      ok: true,
      address: row.address,
      derivationIndex: row.derivationIndex,
      derivationPath: row.derivationPath
    });
  } catch (error: unknown) {
    logger.error("getPolygonHdDepositAddress", { error: readErrorMessage(error) });
    return res.status(500).json({
      ok: false,
      message: "Unable to allocate HD deposit address."
    });
  }
}

export async function getDeposits(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const transactions = await prisma.transaction.findMany({
      where: { userId: user.id, type: "deposit" },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    const normalized = transactions.map((tx) => ({
      ...tx,
      amount: Number(tx.amount),
      fee: tx.fee != null ? Number(tx.fee) : null
    }));
    res.json({ ok: true, deposits: normalized });
  } catch (error: unknown) {
    logger.error("Error getting deposits", { error: readErrorMessage(error) });
    res.status(500).json({ ok: false, message: "Unable to get deposits." });
  }
}

export async function getTransactions(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const transactions = await walletModel.getTransactions(user.id);
    // Converter Decimal do Prisma para número JS para evitar erros no frontend
    const normalized = transactions.map(tx => ({
      ...tx,
      amount: Number(tx.amount),
      fee: tx.fee != null ? Number(tx.fee) : null
    }));
    res.json({ ok: true, transactions: normalized });
  } catch (error: unknown) {
    logger.error("Error getting transactions", { error: readErrorMessage(error) });
    res.status(500).json({ ok: false, message: "Unable to get transactions." });
  }
}

export async function requestDeposit(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
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
    await walletModel.createDepositRequest(user.id, amount, txHash);
    void createAuditLogBestEffort({
      userId: user.id,
      action: "WALLET_DEPOSIT_CREATED",
      label: "Deposit created",
      source: "transaction",
      severity: "success",
      ip: getRequestIp(req),
      userAgent: req.headers?.["user-agent"] || null,
      details: { amount: parsedAmount, txHash },
      relatedEntityType: "transaction",
      relatedEntityId: txHash,
    });
    res.json({ ok: true, message: "Deposit completed and confirmed." });
  } catch (error: unknown) {
    logger.error("Error requesting deposit", { error: readErrorMessage(error) });
    res.status(400).json({ ok: false, message: readErrorMessage(error) || "Unable to complete deposit." });
  }
}

export async function updateAddress(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
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

    await walletModel.saveWalletAddress(user.id, walletAddress);
    void createAuditLogBestEffort({
      userId: user.id,
      action: "WALLET_LINKED",
      label: "Wallet linked",
      source: "user",
      severity: "success",
      ip: getRequestIp(req),
      userAgent: req.headers?.["user-agent"] || null,
      details: { walletAddress },
      relatedEntityType: "wallet",
      relatedEntityId: walletAddress,
    });
    res.json({ ok: true, message: "Wallet verified and linked successfully." });
  } catch (error: unknown) {
    logger.error("Error updating address", { error: readErrorMessage(error) });
    res.status(500).json({ ok: false, message: "Unable to verify wallet address." });
  }
}

export async function requestWithdrawal(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
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

    const transaction = await walletModel.createWithdrawal(user.id, parsedAmount, address);
    void createAuditLogBestEffort({
      userId: user.id,
      action: "WALLET_WITHDRAWAL_REQUESTED",
      label: "Withdrawal requested",
      source: "transaction",
      severity: "warning",
      ip: getRequestIp(req),
      userAgent: req.headers?.["user-agent"] || null,
      details: { amount: parsedAmount, address, transactionId: transaction.id },
      relatedEntityType: "transaction",
      relatedEntityId: transaction.id,
    });
    res.json({
      ok: true,
      message: `Withdrawal request submitted. Processing time: up to ${WITHDRAW_PROCESSING_HOURS} business hours.`,
      transaction
    });
  } catch (error: unknown) {
    const msg = readErrorMessage(error);
    logger.error("Error requesting withdrawal", { error: msg });
    if (msg === "Pending withdrawal exists") {
      return res.status(409).json({ ok: false, message: msg });
    }
    res.status(400).json({ ok: false, message: msg || "Unable to request withdrawal." });
  }
}

/**
 * Registra um depósito para verificação assíncrona na blockchain.
 * O usuário envia o txHash e pode fechar a página — o sistema verifica em background.
 */
const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;

/**
 * Server-side gas estimate for native POL transfers (Trust / some WC paths).
 * Auth + same rate limit as other wallet writes.
 */
export async function postDepositEstimateGas(req: Request, res: Response) {
  try {
    const { from, to, valueHex, data } = req.body || {};
    if (!from || !to || !valueHex || !EVM_ADDR.test(from) || !EVM_ADDR.test(to)) {
      return res.status(400).json({ ok: false, message: "Invalid from, to, or value." });
    }
    if (!/^0x[0-9a-fA-F]+$/.test(valueHex)) {
      return res.status(400).json({ ok: false, message: "Invalid valueHex." });
    }
    let value;
    try {
      value = BigInt(valueHex);
    } catch {
      return res.status(400).json({ ok: false, message: "Invalid valueHex." });
    }
    const dataHex = typeof data === "string" && data.startsWith("0x") ? data : undefined;
    if (dataHex && !/^0x[0-9a-fA-F]*$/.test(dataHex)) {
      return res.status(400).json({ ok: false, message: "Invalid data." });
    }
    const provider = getSharedPolygonProvider();
    const txReq: { from: string; to: string; value: bigint; data?: string } = { from, to, value };
    if (dataHex && dataHex.length > 2) {
      txReq.data = dataHex;
    }
    const estimated = await provider.estimateGas(txReq);
    const padded = estimated + estimated / 5n;
    const cap = 2_500_000n;
    const gasLimit = padded > cap ? cap : padded;
    res.json({ ok: true, gasLimit: `0x${gasLimit.toString(16)}` });
  } catch (e: unknown) {
    logger.warn("deposit estimate gas failed", { error: readErrorMessage(e) });
    res.status(200).json({ ok: true, gasLimit: "0x5208", fallback: true });
  }
}

export async function submitDeposit(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const userId = user.id;
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

    // Registra depósito como pending_verification (unique index on deposit tx_hash prevents double-claim races)
    let deposit;
    try {
      deposit = await prisma.transaction.create({
        data: {
          userId,
          type: "deposit",
          amount: parsedClaimed > 0 ? parsedClaimed.toString() : "0",
          txHash: normalizedHash,
          status: "pending_verification",
          verifyAttempts: 0
        }
      });
    } catch (err: unknown) {
      if (readErrorCode(err) === "P2002") {
        const winner = await prisma.transaction.findFirst({
          where: { txHash: normalizedHash, type: "deposit" }
        });
        if (winner?.userId === userId) {
          logger.info("submitDeposit deduped concurrent same-user claim", { userId, txHash: normalizedHash });
          return res.json({
            ok: true,
            deposit: {
              id: winner.id,
              txHash: normalizedHash,
              status: winner.status
            },
            message:
              winner.status === "pending_verification"
                ? "Depósito já está em verificação."
                : "Esta transação já está registada."
          });
        }
        logger.warn("submitDeposit unique conflict — hash taken by another user or race", {
          userId,
          txHash: normalizedHash
        });
        return res.status(409).json({
          ok: false,
          code: "HASH_CLAIMED",
          message: "Esta transação já foi registada por outra conta."
        });
      }
      throw err;
    }

    // Dispara verificação assíncrona imediatamente (não bloqueia resposta)
    runDepositVerifier().catch(() => {});
    const scanQueued = await enqueueDepositPolygonScan();
    if (!scanQueued) {
      wakeUpScanner();
    }

    logger.info("Deposit submitted for async verification", { userId, txHash: normalizedHash });
    return res.json({
      ok: true,
      deposit: { id: deposit.id, txHash: normalizedHash, status: "pending_verification" },
      message: "Depósito enviado! Verificando na blockchain em segundo plano. Você pode fechar esta página com segurança."
    });
  } catch (err: unknown) {
    logger.error("submitDeposit error", { error: readErrorMessage(err) });
    return res.status(500).json({ ok: false, message: "Erro ao registrar depósito." });
  }
}

/**
 * Retorna os depósitos recentes do usuário (pending, completed, failed).
 * Usado para poll do frontend enquanto o usuário aguarda confirmação.
 */
export async function getPendingDeposits(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const deposits = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        type: "deposit",
        status: { in: ["pending_verification", "btcpay_pending", "completed", "failed"] }
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
    let latestBlock: number | null = null;
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

        let confirmationsCurrent: number | null = null;
        let txMined: boolean | null = null;
        let txReverted: boolean | null = null;
        const isBtcpayHash = typeof d.txHash === "string" && d.txHash.toLowerCase().startsWith("btcpay:");
        if (d.status === "pending_verification" && d.txHash && latestBlock != null && !isBtcpayHash) {
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
  } catch (err: unknown) {
    logger.error("getPendingDeposits error", { error: readErrorMessage(err) });
    return res.status(500).json({ ok: false, message: "Erro ao buscar depósitos." });
  }
}

const VALID_MINING_PAYOUT_MODES = new Set(["pol"]);

/** GET /api/wallet/pol-usd — server-side CoinGecko (avoids browser CORS). */
export async function getWalletPolUsdPrice(req: Request, res: Response) {
  try {
    const priceUsd = await getPolUsdPrice();
    return res.json({ ok: true, priceUsd });
  } catch (err: unknown) {
    logger.warn("getWalletPolUsdPrice", { message: readErrorMessage(err) });
    return res.json({ ok: false, priceUsd: null });
  }
}

/** Mining payout is POL-only. BLK mining mode was removed. */
export async function setMiningPayoutMode(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const raw = String(req.body?.mode ?? "").toLowerCase().trim();
    if (!VALID_MINING_PAYOUT_MODES.has(raw)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid mode. Only 'pol' is supported."
      });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { miningPayoutMode: raw }
    });
    getMiningEngine()?.reloadMinerProfile(user.id).catch(() => {});
    return res.json({ ok: true, miningPayoutMode: raw });
  } catch (err: unknown) {
    logger.error("setMiningPayoutMode error", { error: readErrorMessage(err) });
    return res.status(500).json({ ok: false, message: "Não foi possível atualizar a preferência." });
  }
}
