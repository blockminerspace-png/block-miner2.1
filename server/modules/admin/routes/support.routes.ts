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


// Support / Tickets (specific routes before generic :id)
router.get("/support", adminSupportController.listMessages);
router.get("/support/:id/player-dossier", adminSupportController.getPlayerDossier);
router.post("/support/:id/credit-pol", adminSupportController.creditPol);
router.get("/support/:id", adminSupportController.getMessage);
router.post("/support/:id/reply", adminSupportController.replyToMessage);

// ── Broadcast Messages ──────────────────────────────────────────────────────
import { broadcastImageUpload, buildBroadcastImageUrl } from "../../broadcast/broadcast.upload.js";

router.post("/broadcast/upload-image", (req, res) => {
  broadcastImageUpload.single("image")(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : "Upload inválido.";
      res.status(400).json({ ok: false, message: msg });
      return;
    }
    if (!req.file) {
      res.status(400).json({ ok: false, message: "Nenhum arquivo enviado." });
      return;
    }
    res.json({ ok: true, url: buildBroadcastImageUrl(req.file.filename) });
  });
});

router.get("/broadcast", async (req, res) => {
  try {
    const messages = await prisma.broadcastMessage.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { views: true } } },
    });
    res.json({ ok: true, messages });
  } catch (err: unknown) {
    res.status(500).json({ ok: false, message: adminErrMessage(err) });
  }
});

function clampDismissDelay(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(120, n));
}

/** Accept relative paths (/foo) or http(s) URLs. Trim + clamp length. Empty/null clears. */
function normalizeBroadcastLink(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const s = String(v).trim().slice(0, 1000);
  if (!s) return null;
  if (/^\//.test(s) || /^https?:\/\//i.test(s)) return s;
  return null; // reject anything that's not a relative path or http(s)
}

function normalizeBroadcastLabel(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim().slice(0, 60);
  return s || null;
}

router.post("/broadcast", async (req, res) => {
  try {
    const { title, content, imageUrl, isActive, dismissDelaySeconds, linkUrl, linkLabel, linkNewTab } = req.body;
    if (!title) return res.status(400).json({ ok: false, message: "Title required" });
    // If activating this one, deactivate all others first
    if (isActive) {
      await prisma.broadcastMessage.updateMany({ data: { isActive: false } });
    }
    const delay = clampDismissDelay(dismissDelaySeconds);
    const link = normalizeBroadcastLink(linkUrl);
    const label = normalizeBroadcastLabel(linkLabel);
    const msg = await prisma.broadcastMessage.create({
      data: {
        title,
        content: content || null,
        imageUrl: imageUrl || null,
        isActive: !!isActive,
        ...(delay !== undefined && { dismissDelaySeconds: delay }),
        linkUrl: link ?? null,
        linkLabel: label ?? null,
        linkNewTab: Boolean(linkNewTab),
      },
    });
    res.json({ ok: true, message: msg });
  } catch (err: unknown) {
    res.status(500).json({ ok: false, message: adminErrMessage(err) });
  }
});

router.patch("/broadcast/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, content, imageUrl, isActive, dismissDelaySeconds, linkUrl, linkLabel, linkNewTab } = req.body;
    if (isActive) {
      await prisma.broadcastMessage.updateMany({ where: { id: { not: id } }, data: { isActive: false } });
    }
    const delay = clampDismissDelay(dismissDelaySeconds);
    const link = normalizeBroadcastLink(linkUrl);
    const label = normalizeBroadcastLabel(linkLabel);
    const msg = await prisma.broadcastMessage.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(isActive !== undefined && { isActive }),
        ...(delay !== undefined && { dismissDelaySeconds: delay }),
        ...(link !== undefined && { linkUrl: link }),
        ...(label !== undefined && { linkLabel: label }),
        ...(linkNewTab !== undefined && { linkNewTab: Boolean(linkNewTab) }),
      },
    });
    res.json({ ok: true, message: msg });
  } catch (err: unknown) {
    res.status(500).json({ ok: false, message: adminErrMessage(err) });
  }
});

router.delete("/broadcast/:id", async (req, res) => {
  try {
    await prisma.broadcastMessage.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ ok: false, message: adminErrMessage(err) });
  }
});

// ─── Public Support (admin) ───────────────────────────────────────────────────
router.get("/public-support/tickets", publicSupportCtrl.adminListTickets);
router.get("/public-support/ticket/:id", publicSupportCtrl.adminGetTicket);
router.post("/public-support/ticket/:id/message", publicSupportCtrl.adminReply);
router.patch("/public-support/ticket/:id/status", publicSupportCtrl.adminSetStatus);
