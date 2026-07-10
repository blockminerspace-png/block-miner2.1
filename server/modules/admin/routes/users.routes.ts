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
const logger = loggerLib.child("users.routes");
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


// Users
router.get("/users", async (req, res) => {
    try {
        const data = await listAdminUsers(prisma, req.query);
        res.json(data);
    } catch (error) {
        if (adminErrMessage(error).startsWith("invalid_")) {
            return res.status(400).json({ ok: false, message: "Invalid user search query." });
        }
        logger.error("[admin users list]", { error: String(adminErrMessage(error)) });
        res.status(500).json({ ok: false, message: "Unable to load users." });
    }
});
router.put("/users/:id/ban", async (req, res) => {
    try {
        const data = await setAdminUserBanState(prisma, req.params.id, {
            isBanned: req.body?.isBanned,
            reason: req.body?.reason || (req.body?.isBanned ? "Admin ban" : "Admin unban"),
        });
        res.json({ ok: true, message: data.user.isBanned ? "User banned" : "User unbanned", user: data.user });
    } catch (error) {
        if (adminErrMessage(error).startsWith("invalid_")) {
            return res.status(400).json({ ok: false, message: "Invalid ban request." });
        }
        res.status(500).json({ ok: false, message: "Update failed" });
    }
});
router.post("/users/:id/ban", async (req, res) => {
    try {
        const data = await setAdminUserBanState(prisma, req.params.id, {
            isBanned: true,
            reason: req.body?.reason,
        });
        res.json({ ok: true, user: data.user });
    } catch (error) {
        if (adminErrMessage(error).startsWith("invalid_")) {
            return res.status(400).json({ ok: false, message: "Ban reason is required." });
        }
        res.status(500).json({ ok: false, message: "Unable to ban user." });
    }
});
router.post("/users/:id/unban", async (req, res) => {
    try {
        const data = await setAdminUserBanState(prisma, req.params.id, {
            isBanned: false,
            reason: req.body?.reason,
        });
        res.json({ ok: true, user: data.user });
    } catch (error) {
        if (adminErrMessage(error).startsWith("invalid_")) {
            return res.status(400).json({ ok: false, message: "Unban reason is required." });
        }
        res.status(500).json({ ok: false, message: "Unable to unban user." });
    }
});

// Adjust a user's balance for any currency. Body: { currency, mode, amount, reason? }
//   currency ∈ pol | blk | blkLocked | shib | btc | eth | usdt | usdc | zer
//   mode     ∈ set (replace) | add (delta — positive credits, negative debits)
//   amount   numeric string/number, finite, non-NaN
const CURRENCY_FIELD: Record<string, string> = {
    pol: "polBalance",
    blk: "blkBalance",
    blkLocked: "blkLocked",
    shib: "shibBalance",
    btc: "btcBalance",
    eth: "ethBalance",
    usdt: "usdtBalance",
    usdc: "usdcBalance",
    zer: "zerBalance",
};
router.post("/users/:id/adjust-balance", async (req, res) => {
    try {
        const userId = parseStrictPositiveUserId(req.params.id);
        if (!userId) return res.status(400).json({ ok: false, message: "ID inválido." });

        const body = (req.body ?? {}) as Record<string, unknown>;
        const currency = String(body.currency ?? "").trim();
        const mode = String(body.mode ?? "set").trim();
        const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";

        const field = CURRENCY_FIELD[currency];
        if (!field) return res.status(400).json({ ok: false, message: "currency inválido." });
        if (mode !== "set" && mode !== "add") {
            return res.status(400).json({ ok: false, message: "mode inválido (set|add)." });
        }
        const amount = Number(body.amount);
        if (!Number.isFinite(amount)) {
            return res.status(400).json({ ok: false, message: "amount inválido." });
        }

        const before = (await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, [field]: true } as never,
        })) as { id: number; email: string; [k: string]: unknown } | null;
        if (!before) return res.status(404).json({ ok: false, message: "Usuário não encontrado." });

        const prevValue = Number(before[field] ?? 0);
        const nextValue = mode === "set" ? amount : prevValue + amount;
        if (nextValue < 0) {
            return res.status(400).json({ ok: false, message: "Saldo final não pode ser negativo." });
        }

        const updated = await prisma.user.update({
            where: { id: userId },
            data: { [field]: nextValue } as never,
            select: { id: true, email: true, [field]: true } as never,
        });

        await prisma.auditLog.create({
            data: {
                userId,
                action: "admin_balance_adjust",
                source: "admin",
                severity: "warn",
                label: `${currency.toUpperCase()} ${mode} ${amount}`,
                description: reason || null,
                metadata: {
                    currency, field, mode, amount,
                    prev: prevValue,
                    next: nextValue,
                    delta: nextValue - prevValue,
                    targetEmail: before.email,
                },
            },
        });

        res.json({
            ok: true,
            user: updated,
            prev: prevValue,
            next: nextValue,
            delta: nextValue - prevValue,
        });
    } catch (err) {
        logger.error("[admin adjust-balance]", { error: String(adminErrMessage(err)) });
        res.status(500).json({ ok: false, message: "Erro ao ajustar saldo." });
    }
});

router.post("/users/:id/unlock", async (req, res) => {
    try {
        const userId = parseStrictPositiveUserId(req.params.id);
        if (!userId) return res.status(400).json({ ok: false, message: "ID de usuário inválido." });

        // Remove lockout records tied directly to this userId in callbackQueue.
        const { count } = await prisma.callbackQueue.deleteMany({
            where: { callbackType: "SEC_LOCK", userId },
        });

        void createAuditLogBestEffort({
            userId,
            action: "ADMIN_UNLOCK_ACCOUNT",
            ip: getClientIp(req),
            userAgent: req.headers["user-agent"] || null,
            details: { rowsDeleted: count },
        });

        res.json({ ok: true, message: `Bloqueio removido (${count} registro(s) apagado(s)).` });
    } catch (error) {
        loggerLib.child("AdminUsers").error("admin.unlock.error", { message: adminErrMessage(error) });
        res.status(500).json({ ok: false, message: "Erro ao desbloquear conta." });
    }
});

router.post("/users/:id/reset-password", createRateLimiter({ windowMs: 60_000, max: 10 }), async (req, res) => {
    try {
        const userId = parseStrictPositiveUserId(req.params.id);
        if (!userId) return res.status(400).json({ ok: false, message: "ID de usuário inválido." });

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } });
        if (!user) return res.status(404).json({ ok: false, message: "Usuário não encontrado." });

        const manualPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword.trim() : "";
        if (manualPassword && manualPassword.length < 6) {
            return res.status(400).json({ ok: false, message: "A senha deve ter pelo menos 6 caracteres." });
        }

        const newPassword = manualPassword || (() => {
            const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$";
            return Array.from(crypto.randomBytes(14)).map((b) => charset[b % charset.length]).join("");
        })();

        const passwordHash = await hashPassword(newPassword);
        await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

        void createAuditLogBestEffort({
            userId,
            action: "ADMIN_PASSWORD_RESET",
            ip: getClientIp(req),
            userAgent: req.headers["user-agent"] || null,
            details: { manual: Boolean(manualPassword), resetBy: "admin" },
        });

        res.json({ ok: true, message: "Senha redefinida com sucesso." });
    } catch (error) {
        loggerLib.child("AdminUsers").error("admin.reset-password.error", { message: adminErrMessage(error) });
        res.status(500).json({ ok: false, message: "Erro ao redefinir senha." });
    }
});
