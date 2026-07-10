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


// Upload de imagem (event/miner covers)
router.post("/upload-image", upload.single("image"), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, message: "Nenhum arquivo enviado." });
    const url = `/uploads/${req.file.filename}`;
    res.json({ ok: true, url });
});
// Upload de mídia (banners — imagens, vídeos, GIFs até 100 MB)
router.post("/upload-media", uploadMedia.single("media"), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, message: "Nenhum arquivo enviado." });
    const url = `/uploads/${req.file.filename}`;
    res.json({ ok: true, url });
});
router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = adminErrMessage(err);
    if (message) return res.status(400).json({ ok: false, message });
    res.status(500).json({ ok: false, message: "Erro no upload." });
});

// User app sidebar (visibility / order / Rewards subgroup)
router.get("/sidebar-nav", sidebarNavController.getAdminNav);
router.put("/sidebar-nav", sidebarNavController.putAdminNav);

router.get("/daily-tasks/definitions", adminDailyTasksController.listDefinitions);
router.post("/daily-tasks/definitions", adminDailyTasksController.createDefinition);
router.patch("/daily-tasks/definitions/:id", adminDailyTasksController.patchDefinition);
router.delete("/daily-tasks/definitions/:id", adminDailyTasksController.deleteDefinition);

router.get("/internal-offerwall/offers", adminInternalOfferwallController.listOffers);
router.post("/internal-offerwall/offers", adminInternalOfferwallController.createOffer);
router.patch("/internal-offerwall/offers/:id", adminInternalOfferwallController.patchOffer);
router.get("/internal-offerwall/attempts", adminInternalOfferwallController.listAttempts);
router.post(
  "/internal-offerwall/attempts/:id/approve",
  adminInternalOfferwallController.approveAttempt
);
router.post(
  "/internal-offerwall/attempts/:id/reject",
  adminInternalOfferwallController.rejectAttempt
);
router.get("/internal-offerwall/frame-hosts", adminInternalOfferwallController.listFrameHosts);
router.delete(
  "/internal-offerwall/frame-hosts/:id",
  adminInternalOfferwallController.deactivateFrameHost
);
