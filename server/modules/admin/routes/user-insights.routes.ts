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
const logger = loggerLib.child("user-insights.routes");
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


// User wallet ledger & activity (support / admin tooling)
router.get("/users/:id/wallet-ledger", adminUserInsightsController.getUserWalletLedger);
router.get("/users/:id/activity-summary", adminUserInsightsController.getUserActivitySummary);

// User Details
router.get("/users/:id/details", async (req, res) => {
    try {
        const data = await getAdminUserProfile(prisma, req.params.id);
        if (!data) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' });
        res.json(data);
    } catch (err) {
        logger.error('[admin details error]', { error: String(adminErrMessage(err)) });
        res.status(500).json({ ok: false, message: 'Erro ao carregar detalhes' });
    }
});

router.get("/users/:id", async (req, res) => {
    try {
        const data = await getAdminUserProfile(prisma, req.params.id);
        if (!data) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' });
        res.json(data);
    } catch {
        res.status(500).json({ ok: false, message: 'Erro ao carregar usuário' });
    }
});

router.get("/users/:id/transactions", async (req, res) => {
    try {
        res.json(await listAdminUserTransactions(prisma, req.params.id, req.query));
    } catch (err) {
        if (adminErrMessage(err).startsWith("invalid_")) return res.status(400).json({ ok: false, message: "Invalid transaction query." });
        res.status(500).json({ ok: false, message: 'Erro ao carregar transações' });
    }
});

// User Activity Logs
router.get("/users/:id/logs", async (req, res) => {
    try {
        res.json(await listAdminUserLogs(prisma, req.params.id, req.query));
    } catch (err) {
        if (adminErrMessage(err).startsWith("invalid_")) return res.status(400).json({ ok: false, message: "Invalid logs query." });
        res.status(500).json({ ok: false, message: 'Erro ao carregar logs' });
    }
});

router.get("/users/:id/tickets", async (req, res) => {
    try {
        res.json(await listAdminUserTickets(prisma, req.params.id, req.query));
    } catch (err) {
        if (adminErrMessage(err).startsWith("invalid_")) return res.status(400).json({ ok: false, message: "Invalid tickets query." });
        res.status(500).json({ ok: false, message: 'Erro ao carregar tickets' });
    }
});

router.get("/users/:id/machines", async (req, res) => {
    try {
        res.json(await listAdminUserMachines(prisma, req.params.id, req.query));
    } catch (err) {
        if (adminErrMessage(err).startsWith("invalid_")) return res.status(400).json({ ok: false, message: "Invalid machines query." });
        res.status(500).json({ ok: false, message: 'Erro ao carregar máquinas' });
    }
});

router.get("/users/:id/related", async (req, res) => {
    try {
        const data = await listAdminUserRelated(prisma, req.params.id);
        if (!data) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' });
        res.json(data);
    } catch {
        res.status(500).json({ ok: false, message: 'Erro ao carregar relacionados' });
    }
});

// Send Miner to User
router.post("/users/:id/send-miner", async (req, res) => {
    try {
        const userId = parseStrictPositiveUserId(req.params.id);
        const minerIdRaw = String(req.body?.minerId ?? '');
        const quantity = parseStrictQuantity(req.body?.quantity, 1, 100);
        if (quantity == null) return res.status(400).json({ ok: false, message: 'Quantidade inválida.' });

        if (userId == null) return res.status(400).json({ ok: false, message: 'ID de usuário inválido.' });
        if (!minerIdRaw) return res.status(400).json({ ok: false, message: 'ID de máquina inválido.' });

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, email: true } });
        if (!user) return res.status(404).json({ ok: false, message: 'Usuário não encontrado.' });

        const now = new Date();
        const isEventMiner = minerIdRaw.startsWith('event_');

        if (isEventMiner) {
            const eventMinerId = parseStrictPositiveUserId(minerIdRaw.replace('event_', ''));
            if (eventMinerId == null) return res.status(400).json({ ok: false, message: 'ID de máquina de evento inválido.' });
            const eventMiner = await prisma.eventMiner.findUnique({ where: { id: eventMinerId } });
            if (!eventMiner) return res.status(404).json({ ok: false, message: 'Máquina de evento não encontrada.' });

            await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                await bulkCreateInventoryWithOwnedMachinesTx(
                    tx,
                    userId,
                    {
                        minerId: null,
                        minerName: `[Event] ${eventMiner.name}`,
                        level: 1,
                        hashRate: Number(eventMiner.hashRate),
                        slotSize: Number(eventMiner.slotSize || 1),
                        imageUrl: normalizePersistableMinerImageUrl(eventMiner.imageUrl),
                    },
                    quantity,
                    now,
                );
            });
            void createAuditLogBestEffort({
                userId,
                action: "ADMIN_SEND_EVENT_MINER",
                label: "Admin sent event miner",
                source: "admin",
                severity: "success",
                details: { eventMinerId, quantity, minerName: eventMiner.name },
                relatedEntityType: "event_miner",
                relatedEntityId: eventMinerId,
            });
            res.json({ ok: true, message: `${quantity}x ${eventMiner.name} enviado(s) para ${user.username || user.email}.` });
        } else {
            const minerId = parseStrictPositiveUserId(minerIdRaw);
            if (minerId == null) return res.status(400).json({ ok: false, message: 'ID de máquina inválido.' });
            const miner = await prisma.miner.findUnique({ where: { id: minerId } });
            if (!miner) return res.status(404).json({ ok: false, message: 'Máquina não encontrada.' });

            await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                await bulkCreateInventoryWithOwnedMachinesTx(
                    tx,
                    userId,
                    {
                        minerId: miner.id,
                        minerName: miner.name,
                        level: 1,
                        hashRate: Number(miner.baseHashRate),
                        slotSize: Number(miner.slotSize || 1),
                        imageUrl: normalizePersistableMinerImageUrl(miner.imageUrl),
                    },
                    quantity,
                    now,
                );
            });
            void createAuditLogBestEffort({
                userId,
                action: "ADMIN_SEND_MINER",
                label: "Admin sent miner",
                source: "admin",
                severity: "success",
                details: { minerId: miner.id, quantity, minerName: miner.name },
                relatedEntityType: "miner",
                relatedEntityId: miner.id,
            });
            res.json({ ok: true, message: `${quantity}x ${miner.name} enviado(s) para ${user.username || user.email}.` });
        }
    } catch (err) {
        logger.error('send-miner error', { error: String(err) });
        res.status(500).json({ ok: false, message: 'Erro ao enviar máquina.' });
    }
});
