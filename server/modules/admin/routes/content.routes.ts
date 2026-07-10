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
const logger = loggerLib.child("content.routes");
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


// Banners
// Client error reports (captured by ErrorBoundary + window handlers + API failures)
router.get("/client-errors", async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
        const rows = await prisma.auditLog.findMany({
            where: { action: { in: ["client_error_report", "client_api_failure"] } },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: {
                id: true,
                action: true,
                severity: true,
                label: true,
                description: true,
                ip: true,
                userAgent: true,
                metadata: true,
                createdAt: true,
            },
        });
        res.json({ ok: true, items: rows });
    } catch (err) {
        logger.error("[admin client-errors error]", { error: String(adminErrMessage(err)) });
        res.status(500).json({ ok: false, message: "Erro ao carregar reports." });
    }
});

router.delete("/client-errors", async (_req, res) => {
    try {
        const r = await prisma.auditLog.deleteMany({
            where: { action: { in: ["client_error_report", "client_api_failure"] } },
        });
        res.json({ ok: true, deleted: r.count });
    } catch (err) {
        logger.error("[admin client-errors delete error]", { error: String(adminErrMessage(err)) });
        res.status(500).json({ ok: false, message: "Erro ao limpar reports." });
    }
});

router.get("/banners", bannerController.adminList);
router.post("/banners", bannerController.adminCreate);
router.put("/banners/:id", bannerController.adminUpdate);
router.delete("/banners/:id", bannerController.adminDelete);

// Check-in streak milestones
router.get("/checkin-milestones", adminCheckinMilestoneController.listCheckinMilestones);
router.post("/checkin-milestones", adminCheckinMilestoneController.createCheckinMilestone);
router.put("/checkin-milestones/:id", adminCheckinMilestoneController.updateCheckinMilestone);
router.delete("/checkin-milestones/:id", adminCheckinMilestoneController.deleteCheckinMilestone);

router.get("/read-earn/campaigns", adminReadEarnController.adminListReadEarnCampaigns);
router.post("/read-earn/campaigns", adminReadEarnController.adminCreateReadEarnCampaign);
router.put("/read-earn/campaigns/:id", adminReadEarnController.adminUpdateReadEarnCampaign);
router.delete("/read-earn/campaigns/:id", adminReadEarnController.adminDeleteReadEarnCampaign);
router.get(
  "/read-earn/campaigns/:id/redemptions",
  adminReadEarnController.adminListReadEarnRedemptions
);

// Criadores de Conteúdo
router.get("/creators", creatorController.adminList);
router.get("/creators/search", creatorController.adminSearch);
router.put("/creators/:id", creatorController.adminUpsert);
router.delete("/creators/:id", creatorController.adminRemove);

// Portal de Transparência
router.get("/transparency", transparencyController.adminList);
router.post("/transparency", transparencyController.adminCreate);
router.get("/transparency/wallet/settings", transparencyController.adminWalletGetSettings);
router.put("/transparency/wallet/settings", transparencyController.adminWalletPutSettings);
router.get("/transparency/wallet/activity", transparencyController.adminWalletGetActivity);
router.get("/transparency/tracked-wallets", transparencyController.adminTrackedWalletList);
router.post("/transparency/tracked-wallets", transparencyController.adminTrackedWalletCreate);
router.get("/transparency/tracked-wallets/activity", transparencyController.adminTrackedWalletActivity);
router.put("/transparency/tracked-wallets/:id", transparencyController.adminTrackedWalletUpdate);
router.delete("/transparency/tracked-wallets/:id", transparencyController.adminTrackedWalletDelete);
router.put("/transparency/:id", transparencyController.adminUpdate);
router.delete("/transparency/:id", transparencyController.adminDelete);

// Social — YouTuber Profiles & Video Submissions
router.get("/social/credential-requests", adminSocialController.listCredentialRequests);
router.post("/social/credential-requests/:id/approve", adminSocialController.approveCredential);
router.post("/social/credential-requests/:id/reject", adminSocialController.rejectCredential);
router.get("/social/profiles", adminSocialController.listProfiles);
router.post("/social/profiles", adminSocialController.createProfile);
router.put("/social/profiles/:id", adminSocialController.updateProfile);
router.delete("/social/profiles/:id", adminSocialController.deleteProfile);
router.get("/social/submissions", adminSocialController.listSubmissions);
router.post("/social/submissions/:id/approve", adminSocialController.approveSubmission);
router.post("/social/submissions/:id/reject", adminSocialController.rejectSubmission);
router.delete("/social/submissions/:id", adminSocialController.deleteSubmission);
router.get("/social/reward-settings", adminSocialController.getRewardSettings);
router.put("/social/reward-settings", adminSocialController.setRewardSettings);
