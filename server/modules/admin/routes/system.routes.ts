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
import * as adminOpsController from "../controllers/adminOps.controller.js";
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


// System / audit logs — merges `audit_logs` + `audit_events` (see adminAuditListService.js)
router.get("/audit", async (req, res) => {
    try {
        const payload = await listUnifiedAdminAuditLogs(req.query);
        res.json(payload);
    } catch (error) {
        adminAuditListLogger.error("admin_audit_list_failed", { message: adminErrMessage(error) });
        res.status(500).json({ ok: false, message: "Unable to load audit logs." });
    }
});

// Server Metrics — live CPU/RAM/disk from the Node process host (see adminController.getServerMetrics)
router.get("/server-metrics", (req, res) => adminController.getServerMetrics(req, res));

// Operations snapshot — health, alerts, queues, sockets, economy counters (read-only)
router.get("/ops/snapshot", (req, res) => void adminOpsController.getOpsSnapshot(req, res));

// Backups — full PostgreSQL logical dumps via pg_dump (see databaseBackupService.js)
router.get("/backups", async (req, res) => {
    try {
        const { backups } = await listSqlBackups();
        res.json({ ok: true, backups });
    } catch (error) {
        backupLogger.error("admin_backup_list_failed", { message: adminErrMessage(error) });
        res.status(500).json({ ok: false, message: "Unable to list backups." });
    }
});

router.get("/backups/download", async (req, res) => {
    try {
        const { file } = req.query;
        if (!file) return res.status(400).send("File name required");

        const filePath = await resolveBackupDownloadPath(String(file));
        res.download(filePath);
    } catch (error) {
        if (adminErrMessage(error) === "Invalid backup filename") {
            return res.status(400).send("Invalid file name");
        }
        if (adminErrMessage(error) === "Backup file not found") {
            return res.status(404).send("Not found");
        }
        backupLogger.error("admin_backup_download_failed", { message: adminErrMessage(error) });
        res.status(500).send("Download failed");
    }
});

router.get("/backups/download-bundle", async (req, res) => {
    try {
        const { file } = req.query;
        if (!file) return res.status(400).send("File name required");

        const filePath = await resolveBackupBundleDownloadPath(String(file));
        res.download(filePath);
    } catch (error) {
        if (adminErrMessage(error) === "Invalid backup bundle filename") {
            return res.status(400).send("Invalid file name");
        }
        if (adminErrMessage(error) === "Backup bundle not found") {
            return res.status(404).send("Not found");
        }
        backupLogger.error("admin_backup_bundle_download_failed", { message: adminErrMessage(error) });
        res.status(500).send("Download failed");
    }
});

router.post("/backups", async (req, res) => {
    try {
        const backup = await createPostgresSqlBackup({ prisma, logger: backupLogger });
        res.json({ ok: true, message: "Backup created", backup });
    } catch (error) {
        backupLogger.error("admin_backup_create_failed", { message: adminErrMessage(error) });
        res.status(500).json({ ok: false, message: adminErrMessage(error) || "Backup failed" });
    }
});

router.delete("/backups", async (req, res) => {
    try {
        const { filename } = req.body;
        if (!filename) return res.status(400).json({ ok: false, message: "filename required" });

        await deleteSqlBackup(String(filename));
        res.json({ ok: true, message: "Deleted" });
    } catch (error) {
        if (adminErrMessage(error) === "Invalid backup filename") {
            return res.status(400).json({ ok: false, message: "Invalid backup filename" });
        }
        backupLogger.error("admin_backup_delete_failed", { message: adminErrMessage(error) });
        res.status(500).json({ ok: false, message: "Unable to delete backup." });
    }
});
