import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import * as publicSupportCtrl from "../../../modules/publicSupport/publicSupport.controller.js";
import { getPolUsdPrice } from "../../../utils/cryptoPrice.js";
import * as adminSupportController from "../controllers/adminSupport.controller.js";
import * as adminUserInsightsController from "../controllers/adminUserInsights.controller.js";
import * as bannerController from "../../banners/banner.controller.js";
import * as creatorController from "../controllers/creator.controller.js";
import * as transparencyController from "../../transparency/transparency.controller.js";
import { requireAdminAuth } from "../../../middleware/adminAuth.js";
import { createRateLimiter } from "../../../middleware/rateLimit.js";
import * as walletModel from "../../../models/walletModel.js";
import * as blkWalletController from "../../wallet/blk-wallet.controller.js";
import * as miningController from "../../mining/mining.controller.js";
import * as adminCheckinMilestoneController from "../controllers/adminCheckinMilestone.controller.js";
import * as adminReadEarnController from "../controllers/adminReadEarn.controller.js";
import * as adminSocialController from "../../social/adminSocial.controller.js";
import * as sidebarNavController from "../../sidebar-nav/sidebarNav.controller.js";
import * as adminDailyTasksController from "../controllers/adminDailyTasks.controller.js";
import * as adminInternalOfferwallController from "../../internal-offerwall/internal-offerwall.admin.controller.js";
import * as adminWithdrawalTelegramController from "../controllers/adminWithdrawalTelegram.controller.js";
import { Prisma } from "@prisma/client";
import prisma from "../../../src/db/prisma.js";
import { bulkCreateInventoryWithOwnedMachinesTx } from "../../../services/userOwnedMachineService.js";
import { normalizePersistableMinerImageUrl } from "../../../utils/ownedMachineImage.js";
import {
    createPostgresSqlBackup,
    listSqlBackups,
    deleteSqlBackup,
    resolveBackupDownloadPath,
    resolveBackupBundleDownloadPath,
} from "../../../services/databaseBackupService.js";
import { listUnifiedAdminAuditLogs } from "../../../services/adminAuditListService.js";
import {
  listAdminFraudSignals,
  resetAdminFraudCollectionData,
  ADMIN_FRAUD_COLLECTION_RESET_CONFIRM,
} from "../../../services/adminFraudSignalsService.js";
import { getCachedIpIntelligence } from "../../../services/ipIntelligenceService.js";
import { normalizeIp, getClientIp } from "../../../utils/clientIp.js";
import {
    getAdminUserProfile,
    listAdminUserLogs,
    listAdminUserMachines,
    listAdminUserRelated,
    listAdminUsers,
    listAdminUserTickets,
    listAdminUserTransactions,
    setAdminUserBanState,
} from "../../../services/adminUserManagementService.js";
import loggerLib from "../../../utils/logger.js";
const logger = loggerLib.child("economy.routes");
import path from "path";
import fs from "fs/promises";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";
import { createAuditLogBestEffort } from "../../../models/auditLogModel.js";
import { resolveUploadsRoot } from "../../../utils/uploadsRoot.js";
import { hashPassword } from "../../auth/shared/auth.service.js";
import { sendAdminPasswordResetEmail } from "../../../utils/mailer.js";
import {
  adminErrMessage,
  queryPositiveInt,
  parseStrictPositiveUserId,
  parseStrictQuantity,
  backupLogger,
  adminAuditListLogger,
  upload,
  uploadMedia,
} from "../shared/adminHttp.utils.js";

export const router = Router();


// Faucet — imagem/poder vêm do registro Miner ligado ao FaucetReward (persistidos no DB)
router.get("/faucet/config", async (req, res) => {
  try {
    const reward = await prisma.faucetReward.findFirst({
      where: { isActive: true },
      include: { miner: true },
      orderBy: { id: "asc" },
    });
    if (!reward?.miner) {
      return res.json({ ok: true, configured: false, reward: null });
    }
    return res.json({
      ok: true,
      configured: true,
      reward: {
        rewardId: reward.id,
        cooldownMs: reward.cooldownMs,
        isActive: reward.isActive,
        miner: {
          id: reward.miner.id,
          slug: reward.miner.slug,
          name: reward.miner.name,
          baseHashRate: reward.miner.baseHashRate,
          slotSize: reward.miner.slotSize,
          imageUrl: reward.miner.imageUrl,
        },
      },
    });
  } catch (error) {
    logger.error("[admin faucet/config get]", { error: String(adminErrMessage(error)) });
    return res.status(500).json({ ok: false, message: "Falha ao carregar config da faucet." });
  }
});

router.put("/faucet/config", async (req, res) => {
  try {
    const reward = await prisma.faucetReward.findFirst({
      where: { isActive: true },
      include: { miner: true },
      orderBy: { id: "asc" },
    });
    if (!reward?.miner) {
      return res.status(404).json({ ok: false, message: "Nenhuma faucet ativa configurada." });
    }

    const { baseHashRate, imageUrl, cooldownMs, name } = req.body || {};
    const minerData: Prisma.MinerUpdateInput = {};
    if (name !== undefined && String(name).trim()) minerData.name = String(name).trim();
    if (baseHashRate !== undefined) {
      const v = Number(baseHashRate);
      if (!Number.isFinite(v) || v < 0) {
        return res.status(400).json({ ok: false, message: "baseHashRate inválido." });
      }
      minerData.baseHashRate = v;
    }
    if (imageUrl !== undefined) {
      const u = String(imageUrl).trim();
      minerData.imageUrl = u || null;
    }

    const rewardData: Prisma.FaucetRewardUpdateInput = {};
    if (cooldownMs !== undefined) {
      const c = Number(cooldownMs);
      if (!Number.isFinite(c) || c < 0) {
        return res.status(400).json({ ok: false, message: "cooldownMs inválido." });
      }
      rewardData.cooldownMs = Math.floor(c);
    }

    if (!Object.keys(minerData).length && !Object.keys(rewardData).length) {
      return res.status(400).json({ ok: false, message: "Nenhum campo para atualizar." });
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (Object.keys(minerData).length) {
        await tx.miner.update({ where: { id: reward.miner.id }, data: minerData });
      }
      if (Object.keys(rewardData).length) {
        await tx.faucetReward.update({ where: { id: reward.id }, data: rewardData });
      }
    });

    const fresh = await prisma.faucetReward.findUnique({
      where: { id: reward.id },
      include: { miner: true },
    });
    if (!fresh?.miner) {
      return res.status(500).json({ ok: false, message: "Falha ao recarregar config da faucet." });
    }
    return res.json({
      ok: true,
      reward: {
        rewardId: fresh.id,
        cooldownMs: fresh.cooldownMs,
        isActive: fresh.isActive,
        miner: {
          id: fresh.miner.id,
          slug: fresh.miner.slug,
          name: fresh.miner.name,
          baseHashRate: fresh.miner.baseHashRate,
          slotSize: fresh.miner.slotSize,
          imageUrl: fresh.miner.imageUrl,
        },
      },
    });
  } catch (error) {
    logger.error("[admin faucet/config put]", { error: String(adminErrMessage(error)) });
    return res.status(500).json({ ok: false, message: "Falha ao atualizar config da faucet." });
  }
});

// Withdrawals
router.get("/withdrawals/pending", adminController.listPendingWithdrawals);
router.post("/withdrawals/:withdrawalId/approve", adminController.approveWithdrawal);
router.post("/withdrawals/:withdrawalId/reject", adminController.rejectWithdrawal);
router.post("/withdrawals/:withdrawalId/complete", adminController.completeWithdrawal);
router.get("/withdrawals/telegram-settings", adminWithdrawalTelegramController.getSettings);
router.put("/withdrawals/telegram-settings", adminWithdrawalTelegramController.putSettings);
router.get("/finance/telegram/settings", adminWithdrawalTelegramController.getSettings);
router.patch("/finance/telegram/settings", adminWithdrawalTelegramController.patchSettings);
router.post("/finance/telegram/test-private-alert", adminWithdrawalTelegramController.testPrivateAlert);
router.post("/finance/telegram/test-public-proof", adminWithdrawalTelegramController.testPublicProof);
router.get("/finance/telegram/events", adminWithdrawalTelegramController.listEvents);
router.post("/finance/telegram/events/:id/retry", adminWithdrawalTelegramController.retryEvent);
router.get("/finance/telegram/health", adminWithdrawalTelegramController.getHealth);

// BLK (USD-pegged internal currency, not withdrawable)
router.get("/blk/economy", blkWalletController.adminGetEconomy);
router.put("/blk/economy", blkWalletController.adminPutEconomy);
router.post("/mining/blk-cycle/run", miningController.adminTriggerBlkCycle);

// Finance Overview & Activity
router.get("/finance/overview", async (req, res) => {
    try {
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const [deposits24h, withdrawals24h] = await Promise.all([
            prisma.transaction.aggregate({
                where: { type: 'deposit', createdAt: { gte: dayAgo }, status: 'completed' },
                _sum: { amount: true }
            }),
            prisma.transaction.aggregate({
                where: { type: 'withdrawal', createdAt: { gte: dayAgo }, status: 'completed' },
                _sum: { amount: true }
            })
        ]);

        res.json({
            ok: true,
            overview: {
                deposits24h: Number(deposits24h._sum.amount || 0),
                withdrawals24h: Number(withdrawals24h._sum.amount || 0)
            }
        });
    } catch (error) {
        res.status(500).json({ ok: false, message: "Error" });
    }
});

router.get("/finance/activity", async (req, res) => {
    try {
        const page = Math.max(1, Math.min(10_000, Number(req.query.page) || 1));
        const limit = Math.max(5, Math.min(100, Number(req.query.limit) || Number(req.query.pageSize) || 50));
        const skip = (page - 1) * limit;

        const typeRaw = String(req.query.type || "").trim().toLowerCase();
        const typeFilter = typeRaw === "deposit" || typeRaw === "withdrawal" ? typeRaw : null;

        const statusRaw = String(req.query.status || "").trim().toLowerCase();
        const statusFilter = statusRaw.length > 0 && statusRaw.length <= 40 ? statusRaw : null;

        const hashTrim = String(req.query.hash || req.query.txHash || "").trim().slice(0, 80);
        const qRaw = String(req.query.q || "").trim().slice(0, 120);

        const andParts: Prisma.TransactionWhereInput[] = [];
        if (typeFilter) andParts.push({ type: typeFilter });
        if (statusFilter) andParts.push({ status: statusFilter });
        if (hashTrim) {
            andParts.push({ txHash: { contains: hashTrim, mode: "insensitive" } });
        }
        if (qRaw) {
            const userOr: Prisma.TransactionWhereInput[] = [
                { user: { email: { contains: qRaw, mode: "insensitive" } } },
                { user: { username: { contains: qRaw, mode: "insensitive" } } },
            ];
            if (/^\d+$/.test(qRaw)) {
                const uid = Number(qRaw);
                if (Number.isInteger(uid) && uid > 0) {
                    userOr.push({ userId: uid });
                }
            }
            andParts.push({ OR: userOr });
        }

        const where: Prisma.TransactionWhereInput = andParts.length > 0 ? { AND: andParts } : {};

        const [total, rows] = await Promise.all([
            prisma.transaction.count({ where }),
            prisma.transaction.findMany({
                where,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                skip,
                take: limit,
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            username: true,
                            email: true,
                            walletAddress: true,
                            createdAt: true,
                            lastLoginAt: true,
                            isBanned: true,
                            ip: true,
                            registrationIp: true,
                            refCode: true,
                        },
                    },
                },
            }),
        ]);

        const activity = rows.map((t) => ({
            id: t.id,
            userId: t.userId,
            user_id: t.userId,
            type: t.type,
            amount: Number(t.amount),
            fee: t.fee != null ? Number(t.fee) : null,
            address: t.address,
            txHash: t.txHash,
            tx_hash: t.txHash,
            status: t.status,
            createdAt: t.createdAt,
            created_at: t.createdAt,
            completedAt: t.completedAt,
            fromAddress: t.fromAddress,
            from_address: t.fromAddress,
            user: t.user
                ? {
                      id: t.user.id,
                      name: t.user.name,
                      username: t.user.username,
                      email: t.user.email,
                      walletAddress: t.user.walletAddress,
                      createdAt: t.user.createdAt,
                      lastLoginAt: t.user.lastLoginAt,
                      isBanned: t.user.isBanned,
                      ip: t.user.ip,
                      registrationIp: t.user.registrationIp,
                      refCode: t.user.refCode,
                  }
                : null,
        }));

        res.json({ ok: true, activity, page, limit, total });
    } catch (error) {
        logger.error("[admin finance/activity]", { error: String(adminErrMessage(error)) });
        res.status(500).json({ ok: false, message: "Error" });
    }
});

router.get("/fraud-signals", async (req, res) => {
    try {
        const data = await listAdminFraudSignals(prisma, {
            scope: req.query.scope,
            q: req.query.q,
            maxClusters: req.query.maxClusters,
            page: req.query.page,
            limit: req.query.limit,
        });
        res.json({ ok: true, ...data });
    } catch (error) {
        logger.error("[admin fraud-signals]", { error: String(adminErrMessage(error)) });
        if (adminErrMessage(error).startsWith("invalid_")) {
            return res.status(400).json({ ok: false, message: "Invalid fraud signal query." });
        }
        res.status(500).json({ ok: false, message: "Error" });
    }
});

const fraudRefreshLimiter = createRateLimiter({
    windowMs: 5 * 60 * 1000,
    max: 20,
    message: "Too many IP intelligence refresh requests."
});

router.post("/fraud-signals/refresh-ip", fraudRefreshLimiter, async (req, res) => {
    try {
        const ip = normalizeIp(req.body?.ip);
        if (!ip) return res.status(400).json({ ok: false, message: "Invalid IP." });
        const intelligence = await getCachedIpIntelligence(prisma, ip, { forceRefresh: true });
        res.json({ ok: true, intelligence });
    } catch (error) {
        logger.error("[admin fraud-signals refresh-ip]", { error: String(adminErrMessage(error)) });
        res.status(500).json({ ok: false, message: "Unable to refresh IP intelligence." });
    }
});

const fraudResetLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: "Too many fraud data reset requests. Try again later.",
});

router.post("/fraud-signals/reset-collection", fraudResetLimiter, async (req, res) => {
    try {
        const confirm = String(req.body?.confirm ?? "").trim();
        if (confirm !== ADMIN_FRAUD_COLLECTION_RESET_CONFIRM) {
            return res.status(400).json({ ok: false, message: "Confirmation phrase mismatch." });
        }
        const { ipLogsDeleted, ipIntelDeleted, usersProfileAntiFraudCleared } =
            await resetAdminFraudCollectionData(prisma);
        void createAuditLogBestEffort({
            action: "ADMIN_FRAUD_RESET_COLLECTION",
            label: "Admin reset anti-fraud collection data",
            source: "admin",
            severity: "warning",
            ip: getClientIp(req) || null,
            userAgent: String(req.headers["user-agent"] || "").slice(0, 512) || null,
            details: { ipLogsDeleted, ipIntelDeleted, usersProfileAntiFraudCleared },
        });
        res.json({
            ok: true,
            message: "Fraud collection data cleared.",
            ipLogsDeleted,
            ipIntelDeleted,
            usersProfileAntiFraudCleared,
        });
    } catch (error) {
        logger.error("[admin fraud-signals reset-collection]", { error: String(adminErrMessage(error)) });
        res.status(500).json({ ok: false, message: "Unable to reset fraud collection data." });
    }
});
