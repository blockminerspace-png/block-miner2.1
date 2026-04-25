import express from "express";
import * as adminController from "../controllers/adminController.js";
import { getPolUsdPrice } from "../utils/cryptoPrice.js";
import * as adminSupportController from "../controllers/adminSupportController.js";
import * as adminUserInsightsController from "../controllers/adminUserInsightsController.js";
import * as depositTicketController from "../controllers/depositTicketController.js";
import * as bannerController from "../controllers/bannerController.js";
import * as creatorController from "../controllers/creatorController.js";
import * as transparencyController from "../controllers/transparencyController.js";
import { adminOfferEventsRouter } from "./admin-offer-events.js";
import { adminMiniPassRouter } from "./admin-mini-pass.js";
import { adminLogsRouter } from "./admin-logs.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import * as walletModel from "../models/walletModel.js";
import * as blkWalletController from "../controllers/blkWalletController.js";
import * as miningController from "../controllers/miningController.js";
import * as adminCheckinMilestoneController from "../controllers/adminCheckinMilestoneController.js";
import * as adminReadEarnController from "../controllers/adminReadEarnController.js";
import * as sidebarNavController from "../controllers/sidebarNavController.js";
import * as adminDailyTasksController from "../controllers/adminDailyTasksController.js";
import * as adminInternalOfferwallController from "../controllers/adminInternalOfferwallController.js";
import * as adminWithdrawalTelegramController from "../controllers/adminWithdrawalTelegramController.js";
import { adminYoutubeStreamRouter } from "./admin-youtube-stream.js";
import prisma from "../src/db/prisma.js";
import { bulkCreateInventoryWithOwnedMachinesTx } from "../services/userOwnedMachineService.js";
import {
    createPostgresSqlBackup,
    listSqlBackups,
    deleteSqlBackup,
    resolveBackupDownloadPath,
    resolveBackupBundleDownloadPath,
} from "../services/databaseBackupService.js";
import { listUnifiedAdminAuditLogs } from "../services/adminAuditListService.js";
import { listAdminFraudSignals } from "../services/adminFraudSignalsService.js";
import { getCachedIpIntelligence } from "../services/ipIntelligenceService.js";
import { normalizeIp } from "../utils/clientIp.js";
import {
    archiveAdminMiner,
    createAdminMiner,
    duplicateAdminMiner,
    getAdminMiner,
    listAdminMiners,
    toggleAdminMinerActive,
    toggleAdminMinerStore,
    updateAdminMiner,
    validateMinerImageUrl,
} from "../services/adminMinersService.js";
import {
    getAdminUserProfile,
    listAdminUserLogs,
    listAdminUserMachines,
    listAdminUserRelated,
    listAdminUsers,
    listAdminUserTickets,
    listAdminUserTransactions,
    setAdminUserBanState,
} from "../services/adminUserManagementService.js";
import loggerLib from "../utils/logger.js";
import path from "path";
import fs from "fs/promises";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import crypto from "crypto";
import { createAuditLogBestEffort } from "../models/auditLogModel.js";

export const adminRouter = express.Router();

/**
 * @param {unknown} raw
 * @returns {number | null}
 */
function parseStrictPositiveUserId(raw) {
  const s = String(raw ?? "").trim();
  if (!/^\d{1,12}$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}

/**
 * @param {unknown} raw
 * @param {number} fallback
 * @param {number} max
 * @returns {number | null} null if invalid
 */
function parseStrictQuantity(raw, fallback, max) {
  if (raw === undefined || raw === null || raw === "") {
    return Math.min(max, Math.max(1, fallback));
  }
  const s = String(raw).trim();
  if (!/^\d{1,3}$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) return null;
  return Math.min(max, Math.max(1, n));
}

const backupLogger = loggerLib.child("AdminBackup");
const adminAuditListLogger = loggerLib.child("AdminAuditList");

const adminLimiter = createRateLimiter({
    windowMs: 1 * 60 * 1000,
    max: 100
});

// Multer — salva em /app/uploads (docker) ou ./uploads (dev)
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "../../uploads"));
// Garante que o diretório existe na inicialização (síncrono, sem risco de race condition no multer)
mkdirSync(UPLOADS_DIR, { recursive: true });
const sharedStorage = multer.diskStorage({
    destination: (_req, _file, cb) => { cb(null, UPLOADS_DIR); },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin';
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    }
});
const upload = multer({
    storage: sharedStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
        if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Somente imagens são permitidas.'));
    }
});
const uploadMedia = multer({
    storage: sharedStorage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
    fileFilter: (_req, file, cb) => {
        const allowed = /^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm|ogg|quicktime|x-msvideo))$/;
        if (allowed.test(file.mimetype)) cb(null, true);
        else cb(new Error('Formato não suportado. Use imagens (PNG, JPG, GIF, WebP) ou vídeos (MP4, WebM).'));
    }
});
const uploadMinerImage = multer({
    storage: sharedStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Formato não suportado. Use JPG, PNG ou WebP.'));
    }
});

// Protect all admin routes
adminRouter.use(requireAdminAuth, adminLimiter);

adminRouter.use(adminOfferEventsRouter);
adminRouter.use(adminMiniPassRouter);
adminRouter.use("/logs", adminLogsRouter);

// Upload de imagem (event/miner covers)
adminRouter.post("/upload-image", upload.single("image"), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, message: "Nenhum arquivo enviado." });
    const url = `/uploads/${req.file.filename}`;
    res.json({ ok: true, url });
});
// Upload de mídia (banners — imagens, vídeos, GIFs até 100 MB)
adminRouter.post("/upload-media", uploadMedia.single("media"), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, message: "Nenhum arquivo enviado." });
    const url = `/uploads/${req.file.filename}`;
    res.json({ ok: true, url });
});
adminRouter.use((err, _req, res, _next) => {
    if (err?.message) return res.status(400).json({ ok: false, message: err.message });
    res.status(500).json({ ok: false, message: "Erro no upload." });
});

// User app sidebar (visibility / order / Rewards subgroup)
adminRouter.get("/sidebar-nav", sidebarNavController.getAdminNav);
adminRouter.put("/sidebar-nav", sidebarNavController.putAdminNav);

adminRouter.get("/daily-tasks/definitions", adminDailyTasksController.listDefinitions);
adminRouter.post("/daily-tasks/definitions", adminDailyTasksController.createDefinition);
adminRouter.patch("/daily-tasks/definitions/:id", adminDailyTasksController.patchDefinition);
adminRouter.delete("/daily-tasks/definitions/:id", adminDailyTasksController.deleteDefinition);

adminRouter.get("/internal-offerwall/offers", adminInternalOfferwallController.listOffers);
adminRouter.post("/internal-offerwall/offers", adminInternalOfferwallController.createOffer);
adminRouter.patch("/internal-offerwall/offers/:id", adminInternalOfferwallController.patchOffer);
adminRouter.get("/internal-offerwall/attempts", adminInternalOfferwallController.listAttempts);
adminRouter.post(
  "/internal-offerwall/attempts/:id/approve",
  adminInternalOfferwallController.approveAttempt
);
adminRouter.post(
  "/internal-offerwall/attempts/:id/reject",
  adminInternalOfferwallController.rejectAttempt
);
adminRouter.get("/internal-offerwall/frame-hosts", adminInternalOfferwallController.listFrameHosts);
adminRouter.delete(
  "/internal-offerwall/frame-hosts/:id",
  adminInternalOfferwallController.deactivateFrameHost
);

adminRouter.use(adminYoutubeStreamRouter);

// Dashboard Stats
adminRouter.get("/stats", adminController.getStats);

// Analytics
adminRouter.get("/analytics", async (req, res) => {
    try {
        const { period = 'month', userId } = req.query;

        // POL price
        let polPrice = 0.35;
        try { polPrice = await getPolUsdPrice(); } catch {}

        // Engine constants
        const BLOCK_REWARD = 0.30;      // POL per block
        const BLOCK_DURATION_MS = 10 * 60 * 1000; // 10 min
        const BLOCKS_PER_DAY = (24 * 60 * 60 * 1000) / BLOCK_DURATION_MS; // 144
        const BLOCKS_PER_MONTH = BLOCKS_PER_DAY * 30;
        const BLOCKS_PER_YEAR = BLOCKS_PER_DAY * 365;

        const now = new Date();
        let since;
        const months = [];
        if (period === 'week') {
            since = new Date(now); since.setDate(since.getDate() - 7);
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now); d.setDate(d.getDate() - i);
                months.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
            }
        } else if (period === 'year') {
            since = new Date(now); since.setFullYear(since.getFullYear() - 1);
            for (let i = 11; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                months.push({ label: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }), year: d.getFullYear(), month: d.getMonth() + 1 });
            }
        } else {
            since = new Date(now); since.setMonth(since.getMonth() - 1);
            for (let i = 29; i >= 0; i--) {
                const d = new Date(now); d.setDate(d.getDate() - i);
                months.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
            }
        }

        const userFilter = userId ? { userId: parseInt(userId) } : {};

        const [
            totalDistributed,
            periodDistributed,
            topEarners,
            rewardsOverTime,
            totalWithdrawals,
            periodWithdrawals,
            activeUsersCount,
            blockCount,
            totalBlocksEver,
            networkHashData,
        ] = await Promise.all([
            prisma.blockMinerReward.aggregate({ _sum: { rewardAmount: true }, where: userFilter }),
            prisma.blockMinerReward.aggregate({ _sum: { rewardAmount: true }, where: { ...userFilter, createdAt: { gte: since } } }),
            userId ? Promise.resolve(null) : prisma.blockMinerReward.groupBy({
                by: ['userId'],
                _sum: { rewardAmount: true },
                orderBy: { _sum: { rewardAmount: 'desc' } },
                take: 10,
            }),
            prisma.blockMinerReward.findMany({
                where: { ...userFilter, createdAt: { gte: since } },
                select: { rewardAmount: true, createdAt: true },
                orderBy: { createdAt: 'asc' },
            }),
            prisma.transaction.aggregate({ _sum: { amount: true }, where: { ...userFilter, type: 'withdrawal', status: 'completed' } }),
            prisma.transaction.aggregate({ _sum: { amount: true }, where: { ...userFilter, type: 'withdrawal', status: 'completed', createdAt: { gte: since } } }),
            userId ? Promise.resolve(null) : prisma.blockMinerReward.groupBy({ by: ['userId'], where: { createdAt: { gte: since } } }).then(r => r.length),
            userId ? Promise.resolve(null) : prisma.blockDistribution.count({ where: { createdAt: { gte: since } } }),
            prisma.blockDistribution.count(),
            // Network hashrate: sum hashRate of all active userMiners
            prisma.userMiner.aggregate({ _sum: { hashRate: true }, where: { isActive: true } }),
        ]);

        // User-specific hashrate for forecast
        let userHashRate = 0;
        if (userId) {
            const uhr = await prisma.userMiner.aggregate({ _sum: { hashRate: true }, where: { userId: parseInt(userId), isActive: true } });
            userHashRate = Number(uhr._sum.hashRate || 0);
        }

        const networkHashRate = Number(networkHashData._sum.hashRate || 1);

        // --- FORECAST ---
        // Share = userHashRate / networkHashRate (if no user, show total network)
        const shareRatio = userId && networkHashRate > 0 ? userHashRate / networkHashRate : 1;
        const forecastDay   = BLOCKS_PER_DAY   * BLOCK_REWARD * shareRatio;
        const forecastWeek  = BLOCKS_PER_DAY * 7 * BLOCK_REWARD * shareRatio;
        const forecastMonth = BLOCKS_PER_MONTH * BLOCK_REWARD * shareRatio;
        const forecastYear  = BLOCKS_PER_YEAR  * BLOCK_REWARD * shareRatio;

        // Build top earners with user info
        let topEarnersWithInfo = [];
        if (topEarners) {
            const userIds = topEarners.map(e => e.userId);
            const users = await prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, username: true, email: true }
            });
            const uMap = Object.fromEntries(users.map(u => [u.id, u]));
            topEarnersWithInfo = topEarners.map(e => ({
                userId: e.userId,
                username: uMap[e.userId]?.username || uMap[e.userId]?.email || `#${e.userId}`,
                total: Number(e._sum.rewardAmount || 0),
                totalUsd: Number(e._sum.rewardAmount || 0) * polPrice,
            }));
        }

        // Chart buckets
        const buckets = {};
        for (const r of rewardsOverTime) {
            const d = new Date(r.createdAt);
            let key;
            if (period === 'year') {
                key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            } else {
                key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            }
            buckets[key] = (buckets[key] || 0) + Number(r.rewardAmount);
        }

        const chartData = months.map(m => {
            let key;
            if (period === 'year') {
                key = `${m.year}-${String(m.month).padStart(2, '0')}`;
            } else {
                key = `${m.year}-${String(m.month).padStart(2, '0')}-${String(m.day).padStart(2, '0')}`;
            }
            const pol = Number((buckets[key] || 0).toFixed(8));
            return { label: m.label, value: pol, valueUsd: pol * polPrice };
        });

        let userRecentBlocks = null;
        if (userId) {
            userRecentBlocks = await prisma.blockMinerReward.findMany({
                where: { userId: parseInt(userId) },
                orderBy: { createdAt: 'desc' },
                take: 50,
                include: { block: { select: { blockNumber: true, reward: true } } }
            });
        }

        const totalDistributedPol = Number(totalDistributed._sum.rewardAmount || 0);
        const periodDistributedPol = Number(periodDistributed._sum.rewardAmount || 0);
        const totalWithdrawalsPol = Number(totalWithdrawals._sum.amount || 0);
        const periodWithdrawalsPol = Number(periodWithdrawals._sum.amount || 0);

        res.json({
            ok: true,
            polPrice,
            summary: {
                totalDistributed: totalDistributedPol,
                totalDistributedUsd: totalDistributedPol * polPrice,
                periodDistributed: periodDistributedPol,
                periodDistributedUsd: periodDistributedPol * polPrice,
                totalWithdrawals: totalWithdrawalsPol,
                totalWithdrawalsUsd: totalWithdrawalsPol * polPrice,
                periodWithdrawals: periodWithdrawalsPol,
                periodWithdrawalsUsd: periodWithdrawalsPol * polPrice,
                activeUsers: activeUsersCount ?? null,
                blockCount: blockCount ?? null,
                totalBlocksEver,
                networkHashRate,
                userHashRate: userId ? userHashRate : null,
                period,
            },
            forecast: {
                day:   { pol: forecastDay,   usd: forecastDay   * polPrice },
                week:  { pol: forecastWeek,  usd: forecastWeek  * polPrice },
                month: { pol: forecastMonth, usd: forecastMonth * polPrice },
                year:  { pol: forecastYear,  usd: forecastYear  * polPrice },
                sharePercent: userId ? (shareRatio * 100) : null,
                networkHashRate,
                userHashRate: userId ? userHashRate : null,
            },
            topEarners: topEarnersWithInfo,
            chartData,
            userRecentBlocks,
        });
    } catch (err) {
        console.error('[admin analytics error]', err?.message || err);
        res.status(500).json({ ok: false, message: 'Erro ao carregar analytics.' });
    }
});

// Banners
adminRouter.get("/banners", bannerController.adminList);
adminRouter.post("/banners", bannerController.adminCreate);
adminRouter.put("/banners/:id", bannerController.adminUpdate);
adminRouter.delete("/banners/:id", bannerController.adminDelete);

// Check-in streak milestones
adminRouter.get("/checkin-milestones", adminCheckinMilestoneController.listCheckinMilestones);
adminRouter.post("/checkin-milestones", adminCheckinMilestoneController.createCheckinMilestone);
adminRouter.put("/checkin-milestones/:id", adminCheckinMilestoneController.updateCheckinMilestone);
adminRouter.delete("/checkin-milestones/:id", adminCheckinMilestoneController.deleteCheckinMilestone);

adminRouter.get("/read-earn/campaigns", adminReadEarnController.adminListReadEarnCampaigns);
adminRouter.post("/read-earn/campaigns", adminReadEarnController.adminCreateReadEarnCampaign);
adminRouter.put("/read-earn/campaigns/:id", adminReadEarnController.adminUpdateReadEarnCampaign);
adminRouter.delete("/read-earn/campaigns/:id", adminReadEarnController.adminDeleteReadEarnCampaign);
adminRouter.get(
  "/read-earn/campaigns/:id/redemptions",
  adminReadEarnController.adminListReadEarnRedemptions
);

// Criadores de Conteúdo
adminRouter.get("/creators", creatorController.adminList);
adminRouter.get("/creators/search", creatorController.adminSearch);
adminRouter.put("/creators/:id", creatorController.adminUpsert);
adminRouter.delete("/creators/:id", creatorController.adminRemove);

// Portal de Transparência
adminRouter.get("/transparency", transparencyController.adminList);
adminRouter.post("/transparency", transparencyController.adminCreate);
adminRouter.get("/transparency/wallet/settings", transparencyController.adminWalletGetSettings);
adminRouter.put("/transparency/wallet/settings", transparencyController.adminWalletPutSettings);
adminRouter.get("/transparency/wallet/activity", transparencyController.adminWalletGetActivity);
adminRouter.get("/transparency/tracked-wallets", transparencyController.adminTrackedWalletList);
adminRouter.post("/transparency/tracked-wallets", transparencyController.adminTrackedWalletCreate);
adminRouter.get("/transparency/tracked-wallets/activity", transparencyController.adminTrackedWalletActivity);
adminRouter.put("/transparency/tracked-wallets/:id", transparencyController.adminTrackedWalletUpdate);
adminRouter.delete("/transparency/tracked-wallets/:id", transparencyController.adminTrackedWalletDelete);
adminRouter.put("/transparency/:id", transparencyController.adminUpdate);
adminRouter.delete("/transparency/:id", transparencyController.adminDelete);

// Users
adminRouter.get("/users", async (req, res) => {
    try {
        const data = await listAdminUsers(prisma, req.query);
        res.json(data);
    } catch (error) {
        if (String(error?.message || "").startsWith("invalid_")) {
            return res.status(400).json({ ok: false, message: "Invalid user search query." });
        }
        console.error("[admin users list]", error?.message || error);
        res.status(500).json({ ok: false, message: "Unable to load users." });
    }
});
adminRouter.put("/users/:id/ban", async (req, res) => {
    try {
        const data = await setAdminUserBanState(prisma, req.params.id, {
            isBanned: req.body?.isBanned,
            reason: req.body?.reason || (req.body?.isBanned ? "Admin ban" : "Admin unban"),
        });
        res.json({ ok: true, message: data.user.isBanned ? "User banned" : "User unbanned", user: data.user });
    } catch (error) {
        if (String(error?.message || "").startsWith("invalid_")) {
            return res.status(400).json({ ok: false, message: "Invalid ban request." });
        }
        res.status(500).json({ ok: false, message: "Update failed" });
    }
});
adminRouter.post("/users/:id/ban", async (req, res) => {
    try {
        const data = await setAdminUserBanState(prisma, req.params.id, {
            isBanned: true,
            reason: req.body?.reason,
        });
        res.json({ ok: true, user: data.user });
    } catch (error) {
        if (String(error?.message || "").startsWith("invalid_")) {
            return res.status(400).json({ ok: false, message: "Ban reason is required." });
        }
        res.status(500).json({ ok: false, message: "Unable to ban user." });
    }
});
adminRouter.post("/users/:id/unban", async (req, res) => {
    try {
        const data = await setAdminUserBanState(prisma, req.params.id, {
            isBanned: false,
            reason: req.body?.reason,
        });
        res.json({ ok: true, user: data.user });
    } catch (error) {
        if (String(error?.message || "").startsWith("invalid_")) {
            return res.status(400).json({ ok: false, message: "Unban reason is required." });
        }
        res.status(500).json({ ok: false, message: "Unable to unban user." });
    }
});

// Miners
adminRouter.get("/miners", async (req, res) => {
    try {
        const data = await listAdminMiners(prisma, req.query);
        const miners = [...data.miners];
        if (req.query.withEvents === '1') {
            const eventMiners = await prisma.eventMiner.findMany({
                where: { isActive: true, event: { isActive: true, deletedAt: null } },
                include: { event: { select: { title: true } } },
                orderBy: { id: 'asc' }
            });
            for (const em of eventMiners) {
                miners.push({
                    id: `event_${em.id}`,
                    name: `[Evento: ${em.event.title}] ${em.name}`,
                    baseHashRate: Number(em.hashRate),
                    price: 0,
                    slotSize: Number(em.slotSize ?? 1),
                    imageUrl: em.imageUrl && String(em.imageUrl).trim() !== "" ? String(em.imageUrl).trim() : null,
                    isActive: Boolean(em.isActive),
                    showInShop: false,
                    slug: null,
                    createdAt: em.createdAt
                });
            }
        }

        res.json({ ...data, miners });
    } catch (error) {
        console.error('[admin miners error]', error?.message || error);
        if (String(error?.message || "").startsWith("invalid_")) {
            return res.status(400).json({ ok: false, message: "Invalid miner query." });
        }
        res.status(500).json({ ok: false, message: "Load failed" });
    }
});
adminRouter.post("/miners", async (req, res) => {
    try {
        res.json(await createAdminMiner(prisma, req.body));
    } catch (error) {
        if (String(error?.message || "").startsWith("invalid_")) return res.status(400).json({ ok: false, message: "Invalid miner payload." });
        if (error?.code === "P2002") return res.status(409).json({ ok: false, message: "Slug must be unique." });
        res.status(500).json({ ok: false, message: "Creation failed" });
    }
});
adminRouter.get("/miners/:id", async (req, res) => {
    try {
        const data = await getAdminMiner(prisma, req.params.id);
        if (!data) return res.status(404).json({ ok: false, message: "Miner not found." });
        res.json(data);
    } catch (error) {
        if (String(error?.message || "").startsWith("invalid_")) return res.status(400).json({ ok: false, message: "Invalid miner id." });
        res.status(500).json({ ok: false, message: "Load failed" });
    }
});
adminRouter.patch("/miners/:id", async (req, res) => {
    try {
        const data = await updateAdminMiner(prisma, req.params.id, req.body);
        if (!data) return res.status(404).json({ ok: false, message: "Miner not found." });
        res.json(data);
    } catch (error) {
        if (String(error?.message || "").startsWith("invalid_")) return res.status(400).json({ ok: false, message: "Invalid miner payload." });
        if (error?.code === "P2002") return res.status(409).json({ ok: false, message: "Slug must be unique." });
        res.status(500).json({ ok: false, message: "Update failed" });
    }
});
adminRouter.put("/miners/:id", async (req, res) => {
    try {
        const data = await updateAdminMiner(prisma, req.params.id, req.body);
        if (!data) return res.status(404).json({ ok: false, message: "Miner not found." });
        res.json(data);
    } catch (error) {
        if (String(error?.message || "").startsWith("invalid_")) return res.status(400).json({ ok: false, message: "Invalid miner payload." });
        if (error?.code === "P2002") return res.status(409).json({ ok: false, message: "Slug must be unique." });
        res.status(500).json({ ok: false, message: "Update failed" });
    }
});
adminRouter.post("/miners/:id/duplicate", async (req, res) => {
    try {
        const data = await duplicateAdminMiner(prisma, req.params.id);
        if (!data) return res.status(404).json({ ok: false, message: "Miner not found." });
        res.json(data);
    } catch (error) {
        if (String(error?.message || "").startsWith("invalid_")) return res.status(400).json({ ok: false, message: "Invalid miner id." });
        res.status(500).json({ ok: false, message: "Duplicate failed" });
    }
});
adminRouter.post("/miners/:id/archive", async (req, res) => {
    try {
        res.json(await archiveAdminMiner(prisma, req.params.id));
    } catch (error) {
        if (String(error?.message || "").startsWith("invalid_")) return res.status(400).json({ ok: false, message: "Invalid miner id." });
        res.status(500).json({ ok: false, message: "Archive failed" });
    }
});
adminRouter.post("/miners/:id/toggle-store", async (req, res) => {
    try {
        res.json(await toggleAdminMinerStore(prisma, req.params.id, req.body?.showInShop ?? req.body?.isStoreVisible));
    } catch (error) {
        if (String(error?.message || "").startsWith("invalid_")) return res.status(400).json({ ok: false, message: "Invalid miner id." });
        res.status(500).json({ ok: false, message: "Toggle failed" });
    }
});
adminRouter.post("/miners/:id/toggle-active", async (req, res) => {
    try {
        res.json(await toggleAdminMinerActive(prisma, req.params.id, req.body?.isActive));
    } catch (error) {
        if (String(error?.message || "").startsWith("invalid_")) return res.status(400).json({ ok: false, message: "Invalid miner id." });
        res.status(500).json({ ok: false, message: "Toggle failed" });
    }
});
adminRouter.post("/miners/upload-image", (req, res) => {
    uploadMinerImage.single("image")(req, res, (err) => {
      try {
        if (err) return res.status(400).json({ ok: false, message: err.message || "Upload inválido." });
        if (!req.file) return res.status(400).json({ ok: false, message: "Nenhum arquivo enviado." });
        const url = validateMinerImageUrl(`/uploads/${req.file.filename}`);
        res.json({ ok: true, url });
      } catch {
        res.status(400).json({ ok: false, message: "Imagem inválida." });
      }
    });
});

// Faucet — imagem/poder vêm do registro Miner ligado ao FaucetReward (persistidos no DB)
adminRouter.get("/faucet/config", async (req, res) => {
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
    console.error("[admin faucet/config get]", error?.message || error);
    return res.status(500).json({ ok: false, message: "Falha ao carregar config da faucet." });
  }
});

adminRouter.put("/faucet/config", async (req, res) => {
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
    const minerData = {};
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

    const rewardData = {};
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

    await prisma.$transaction(async (tx) => {
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
    console.error("[admin faucet/config put]", error?.message || error);
    return res.status(500).json({ ok: false, message: "Falha ao atualizar config da faucet." });
  }
});

// Withdrawals
adminRouter.get("/withdrawals/pending", adminController.listPendingWithdrawals);
adminRouter.post("/withdrawals/:withdrawalId/approve", adminController.approveWithdrawal);
adminRouter.post("/withdrawals/:withdrawalId/reject", adminController.rejectWithdrawal);
adminRouter.post("/withdrawals/:withdrawalId/complete", adminController.completeWithdrawal);
adminRouter.get("/withdrawals/telegram-settings", adminWithdrawalTelegramController.getSettings);
adminRouter.put("/withdrawals/telegram-settings", adminWithdrawalTelegramController.putSettings);
adminRouter.get("/finance/telegram/settings", adminWithdrawalTelegramController.getSettings);
adminRouter.patch("/finance/telegram/settings", adminWithdrawalTelegramController.patchSettings);
adminRouter.post("/finance/telegram/test-private-alert", adminWithdrawalTelegramController.testPrivateAlert);
adminRouter.post("/finance/telegram/test-public-proof", adminWithdrawalTelegramController.testPublicProof);
adminRouter.get("/finance/telegram/events", adminWithdrawalTelegramController.listEvents);
adminRouter.post("/finance/telegram/events/:id/retry", adminWithdrawalTelegramController.retryEvent);
adminRouter.get("/finance/telegram/health", adminWithdrawalTelegramController.getHealth);

// BLK (USD-pegged internal currency, not withdrawable)
adminRouter.get("/blk/economy", blkWalletController.adminGetEconomy);
adminRouter.put("/blk/economy", blkWalletController.adminPutEconomy);
adminRouter.post("/mining/blk-cycle/run", miningController.adminTriggerBlkCycle);

// Finance Overview & Activity
adminRouter.get("/finance/overview", async (req, res) => {
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

adminRouter.get("/finance/activity", async (req, res) => {
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

        const andParts = [];
        if (typeFilter) andParts.push({ type: typeFilter });
        if (statusFilter) andParts.push({ status: statusFilter });
        if (hashTrim) {
            andParts.push({ txHash: { contains: hashTrim, mode: "insensitive" } });
        }
        if (qRaw) {
            const userOr = [
                { user: { email: { contains: qRaw, mode: "insensitive" } } },
                { user: { username: { contains: qRaw, mode: "insensitive" } } },
            ];
            if (/^\d+$/.test(qRaw)) {
                const uid = Number(qRaw);
                if (Number.isInteger(uid) && uid > 0) {
                    userOr.push({ user: { id: uid } });
                }
            }
            andParts.push({ OR: userOr });
        }

        const where = andParts.length > 0 ? { AND: andParts } : {};

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
        console.error("[admin finance/activity]", error?.message || error);
        res.status(500).json({ ok: false, message: "Error" });
    }
});

adminRouter.get("/fraud-signals", async (req, res) => {
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
        console.error("[admin fraud-signals]", error?.message || error);
        if (String(error?.message || "").startsWith("invalid_")) {
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

adminRouter.post("/fraud-signals/refresh-ip", fraudRefreshLimiter, async (req, res) => {
    try {
        const ip = normalizeIp(req.body?.ip);
        if (!ip) return res.status(400).json({ ok: false, message: "Invalid IP." });
        const intelligence = await getCachedIpIntelligence(prisma, ip, { forceRefresh: true });
        res.json({ ok: true, intelligence });
    } catch (error) {
        console.error("[admin fraud-signals refresh-ip]", error?.message || error);
        res.status(500).json({ ok: false, message: "Unable to refresh IP intelligence." });
    }
});

// System / audit logs — merges `audit_logs` + `audit_events` (see adminAuditListService.js)
adminRouter.get("/audit", async (req, res) => {
    try {
        const payload = await listUnifiedAdminAuditLogs(req.query);
        res.json(payload);
    } catch (error) {
        adminAuditListLogger.error("admin_audit_list_failed", { message: error?.message || String(error) });
        res.status(500).json({ ok: false, message: "Unable to load audit logs." });
    }
});

// Server Metrics — live CPU/RAM/disk from the Node process host (see adminController.getServerMetrics)
adminRouter.get("/server-metrics", (req, res) => adminController.getServerMetrics(req, res));

// Backups — full PostgreSQL logical dumps via pg_dump (see databaseBackupService.js)
adminRouter.get("/backups", async (req, res) => {
    try {
        const { backups } = await listSqlBackups();
        res.json({ ok: true, backups });
    } catch (error) {
        backupLogger.error("admin_backup_list_failed", { message: error?.message || String(error) });
        res.status(500).json({ ok: false, message: "Unable to list backups." });
    }
});

adminRouter.get("/backups/download", async (req, res) => {
    try {
        const { file } = req.query;
        if (!file) return res.status(400).send("File name required");

        const filePath = await resolveBackupDownloadPath(String(file));
        res.download(filePath);
    } catch (error) {
        if (error?.message === "Invalid backup filename") {
            return res.status(400).send("Invalid file name");
        }
        if (error?.message === "Backup file not found") {
            return res.status(404).send("Not found");
        }
        backupLogger.error("admin_backup_download_failed", { message: error?.message || String(error) });
        res.status(500).send("Download failed");
    }
});

adminRouter.get("/backups/download-bundle", async (req, res) => {
    try {
        const { file } = req.query;
        if (!file) return res.status(400).send("File name required");

        const filePath = await resolveBackupBundleDownloadPath(String(file));
        res.download(filePath);
    } catch (error) {
        if (error?.message === "Invalid backup bundle filename") {
            return res.status(400).send("Invalid file name");
        }
        if (error?.message === "Backup bundle not found") {
            return res.status(404).send("Not found");
        }
        backupLogger.error("admin_backup_bundle_download_failed", { message: error?.message || String(error) });
        res.status(500).send("Download failed");
    }
});

adminRouter.post("/backups", async (req, res) => {
    try {
        const backup = await createPostgresSqlBackup({ prisma, logger: backupLogger });
        res.json({ ok: true, message: "Backup created", backup });
    } catch (error) {
        backupLogger.error("admin_backup_create_failed", { message: error?.message || String(error) });
        res.status(500).json({ ok: false, message: error?.message || "Backup failed" });
    }
});

adminRouter.delete("/backups", async (req, res) => {
    try {
        const { filename } = req.body;
        if (!filename) return res.status(400).json({ ok: false, message: "filename required" });

        await deleteSqlBackup(String(filename));
        res.json({ ok: true, message: "Deleted" });
    } catch (error) {
        if (error?.message === "Invalid backup filename") {
            return res.status(400).json({ ok: false, message: "Invalid backup filename" });
        }
        backupLogger.error("admin_backup_delete_failed", { message: error?.message || String(error) });
        res.status(500).json({ ok: false, message: "Unable to delete backup." });
    }
});

// User wallet ledger & activity (support / admin tooling)
adminRouter.get("/users/:id/wallet-ledger", adminUserInsightsController.getUserWalletLedger);
adminRouter.get("/users/:id/activity-summary", adminUserInsightsController.getUserActivitySummary);

// User Details
adminRouter.get("/users/:id/details", async (req, res) => {
    try {
        const data = await getAdminUserProfile(prisma, req.params.id);
        if (!data) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' });
        res.json(data);
    } catch (err) {
        console.error('[admin details error]', err?.message || err);
        res.status(500).json({ ok: false, message: 'Erro ao carregar detalhes' });
    }
});

adminRouter.get("/users/:id", async (req, res) => {
    try {
        const data = await getAdminUserProfile(prisma, req.params.id);
        if (!data) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' });
        res.json(data);
    } catch {
        res.status(500).json({ ok: false, message: 'Erro ao carregar usuário' });
    }
});

adminRouter.get("/users/:id/transactions", async (req, res) => {
    try {
        res.json(await listAdminUserTransactions(prisma, req.params.id, req.query));
    } catch (err) {
        if (String(err?.message || "").startsWith("invalid_")) return res.status(400).json({ ok: false, message: "Invalid transaction query." });
        res.status(500).json({ ok: false, message: 'Erro ao carregar transações' });
    }
});

// User Activity Logs
adminRouter.get("/users/:id/logs", async (req, res) => {
    try {
        res.json(await listAdminUserLogs(prisma, req.params.id, req.query));
    } catch (err) {
        if (String(err?.message || "").startsWith("invalid_")) return res.status(400).json({ ok: false, message: "Invalid logs query." });
        res.status(500).json({ ok: false, message: 'Erro ao carregar logs' });
    }
});

adminRouter.get("/users/:id/tickets", async (req, res) => {
    try {
        res.json(await listAdminUserTickets(prisma, req.params.id, req.query));
    } catch (err) {
        if (String(err?.message || "").startsWith("invalid_")) return res.status(400).json({ ok: false, message: "Invalid tickets query." });
        res.status(500).json({ ok: false, message: 'Erro ao carregar tickets' });
    }
});

adminRouter.get("/users/:id/machines", async (req, res) => {
    try {
        res.json(await listAdminUserMachines(prisma, req.params.id, req.query));
    } catch (err) {
        if (String(err?.message || "").startsWith("invalid_")) return res.status(400).json({ ok: false, message: "Invalid machines query." });
        res.status(500).json({ ok: false, message: 'Erro ao carregar máquinas' });
    }
});

adminRouter.get("/users/:id/related", async (req, res) => {
    try {
        const data = await listAdminUserRelated(prisma, req.params.id);
        if (!data) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' });
        res.json(data);
    } catch {
        res.status(500).json({ ok: false, message: 'Erro ao carregar relacionados' });
    }
});

// Send Miner to User
adminRouter.post("/users/:id/send-miner", async (req, res) => {
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

            await prisma.$transaction(async (tx) => {
                await bulkCreateInventoryWithOwnedMachinesTx(
                    tx,
                    userId,
                    {
                        minerId: null,
                        minerName: eventMiner.name,
                        level: 1,
                        hashRate: Number(eventMiner.hashRate),
                        slotSize: Number(eventMiner.slotSize || 1),
                        imageUrl: eventMiner.imageUrl || "/machines/reward1.png",
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

            await prisma.$transaction(async (tx) => {
                await bulkCreateInventoryWithOwnedMachinesTx(
                    tx,
                    userId,
                    {
                        minerId: miner.id,
                        minerName: miner.name,
                        level: 1,
                        hashRate: Number(miner.baseHashRate),
                        slotSize: Number(miner.slotSize || 1),
                        imageUrl: miner.imageUrl || "/machines/reward1.png",
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
        console.error('send-miner error', err);
        res.status(500).json({ ok: false, message: 'Erro ao enviar máquina.' });
    }
});

// Support / Tickets (specific routes before generic :id)
adminRouter.get("/support", adminSupportController.listMessages);
adminRouter.get("/support/:id/player-dossier", adminSupportController.getPlayerDossier);
adminRouter.get("/support/:id", adminSupportController.getMessage);
adminRouter.post("/support/:id/reply", adminSupportController.replyToMessage);

// Deposit Tickets
adminRouter.get("/deposit-tickets", depositTicketController.adminListTickets);
adminRouter.get("/deposit-tickets/:id", depositTicketController.adminGetTicket);
adminRouter.post("/deposit-tickets/:id/approve", depositTicketController.adminApproveTicket);
adminRouter.post("/deposit-tickets/:id/reject", depositTicketController.adminRejectTicket);

// ── Broadcast Messages ──────────────────────────────────────────────────────
adminRouter.get("/broadcast", async (req, res) => {
  try {
    const messages = await prisma.broadcastMessage.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { views: true } } },
    });
    res.json({ ok: true, messages });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

adminRouter.post("/broadcast", async (req, res) => {
  try {
    const { title, content, imageUrl, isActive } = req.body;
    if (!title) return res.status(400).json({ ok: false, message: "Title required" });
    // If activating this one, deactivate all others first
    if (isActive) {
      await prisma.broadcastMessage.updateMany({ data: { isActive: false } });
    }
    const msg = await prisma.broadcastMessage.create({
      data: { title, content: content || null, imageUrl: imageUrl || null, isActive: !!isActive },
    });
    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

adminRouter.patch("/broadcast/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, content, imageUrl, isActive } = req.body;
    if (isActive) {
      await prisma.broadcastMessage.updateMany({ where: { id: { not: id } }, data: { isActive: false } });
    }
    const msg = await prisma.broadcastMessage.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json({ ok: true, message: msg });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

adminRouter.delete("/broadcast/:id", async (req, res) => {
  try {
    await prisma.broadcastMessage.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});
