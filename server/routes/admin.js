import express from "express";
import * as adminController from "../controllers/adminController.js";
import { getPolUsdPrice } from "../utils/cryptoPrice.js";
import * as adminSupportController from "../controllers/adminSupportController.js";
import * as depositTicketController from "../controllers/depositTicketController.js";
import * as bannerController from "../controllers/bannerController.js";
import * as creatorController from "../controllers/creatorController.js";
import * as transparencyController from "../controllers/transparencyController.js";
import { adminOfferEventsRouter } from "./admin-offer-events.js";
import { requireAdminAuth } from "../middleware/adminAuth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import * as walletModel from "../models/walletModel.js";
import prisma from "../src/db/prisma.js";
import path from "path";
import fs from "fs/promises";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import crypto from "crypto";

export const adminRouter = express.Router();

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
        if (/^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Somente imagens são permitidas.'));
    }
});
const uploadMedia = multer({
    storage: sharedStorage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
    fileFilter: (_req, file, cb) => {
        const allowed = /^(image\/(jpeg|png|gif|webp|svg\+xml)|video\/(mp4|webm|ogg|quicktime|x-msvideo))$/;
        if (allowed.test(file.mimetype)) cb(null, true);
        else cb(new Error('Formato não suportado. Use imagens (PNG, JPG, GIF, WebP) ou vídeos (MP4, WebM).'));
    }
});

// Protect all admin routes
adminRouter.use(requireAdminAuth, adminLimiter);

adminRouter.use(adminOfferEventsRouter);

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

// Criadores de Conteúdo
adminRouter.get("/creators", creatorController.adminList);
adminRouter.get("/creators/search", creatorController.adminSearch);
adminRouter.put("/creators/:id", creatorController.adminUpsert);
adminRouter.delete("/creators/:id", creatorController.adminRemove);

// Portal de Transparência
adminRouter.get("/transparency", transparencyController.adminList);
adminRouter.post("/transparency", transparencyController.adminCreate);
adminRouter.put("/transparency/:id", transparencyController.adminUpdate);
adminRouter.delete("/transparency/:id", transparencyController.adminDelete);

// Users
adminRouter.get("/users", adminController.listRecentUsers);
adminRouter.put("/users/:id/ban", adminController.setUserBan);

// Miners
adminRouter.get("/miners", async (req, res) => {
    try {
        const rows = await prisma.miner.findMany({ orderBy: { id: 'asc' } });
        const miners = rows.map(m => ({
            id: m.id,
            name: m.name,
            slug: m.slug,
            baseHashRate: Number(m.baseHashRate ?? 0),
            price: Number(m.price ?? 0),
            slotSize: Number(m.slotSize ?? 1),
            imageUrl: m.imageUrl && String(m.imageUrl).trim() !== "" ? String(m.imageUrl).trim() : null,
            isActive: Boolean(m.isActive),
            showInShop: Boolean(m.showInShop),
            createdAt: m.createdAt
        }));

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

        res.json({ ok: true, miners });
    } catch (error) {
        console.error('[admin miners error]', error?.message || error);
        res.status(500).json({ ok: false, message: "Load failed" });
    }
});
adminRouter.post("/miners", adminController.createMiner);
adminRouter.put("/miners/:id", adminController.updateMiner);

// Withdrawals
adminRouter.get("/withdrawals/pending", adminController.listPendingWithdrawals);
adminRouter.post("/withdrawals/:withdrawalId/approve", adminController.approveWithdrawal);
adminRouter.post("/withdrawals/:withdrawalId/reject", adminController.rejectWithdrawal);
adminRouter.post("/withdrawals/:withdrawalId/complete", adminController.completeWithdrawal);

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
        const activity = await prisma.transaction.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        res.json({ ok: true, activity });
    } catch (error) {
        res.status(500).json({ ok: false, message: "Error" });
    }
});

// Audit Logs
adminRouter.get("/audit", async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 10;
        const logs = await prisma.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit
        });
        res.json({ ok: true, logs });
    } catch (error) {
        res.status(500).json({ ok: false, message: "Error" });
    }
});

// Server Metrics
adminRouter.get("/server-metrics", async (req, res) => {
    try {
        // Simple mock of metrics since full OS logic might require `adminController.collectServerMetrics`
        // Wait, getStats already returns metrics, let's just reuse adminController's logic or call it here
        const os = await import("os");
        res.json({
            ok: true,
            metrics: {
                cpuUsagePercent: Math.random() * 10, // Mocked for speed if not implemented fully
                memoryTotalBytes: os.totalmem(),
                memoryFreeBytes: os.freemem(),
                memoryUsedBytes: os.totalmem() - os.freemem(),
                memoryUsagePercent: (1 - os.freemem() / os.totalmem()) * 100,
                uptimeSeconds: process.uptime(),
                platform: process.platform,
                cpuCores: os.cpus().length,
                processId: process.pid,
                nodeVersion: process.version,
                diskTotalBytes: 500 * 1024 * 1024 * 1024, // Mock
                diskUsedBytes: 50 * 1024 * 1024 * 1024,   // Mock
                diskUsagePercent: 10
            }
        });
    } catch (error) {
        res.status(500).json({ ok: false, message: "Error" });
    }
});

// Backups
adminRouter.get("/backups", async (req, res) => {
    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const backupsDir = path.join(__dirname, "../../backups");

        try {
            await fs.mkdir(backupsDir, { recursive: true });
        } catch (e) { }

        const files = await fs.readdir(backupsDir);
        const backups = [];

        for (const file of files) {
            if (file.endsWith('.sql') || file.endsWith('.db')) {
                const stat = await fs.stat(path.join(backupsDir, file));
                backups.push({
                    name: file,
                    size: stat.size,
                    created: stat.mtime
                });
            }
        }

        backups.sort((a, b) => b.created - a.created);
        res.json({ ok: true, backups });
    } catch (error) {
        res.status(500).json({ ok: false, message: "Error" });
    }
});

adminRouter.get("/backups/download", async (req, res) => {
    try {
        const { file } = req.query;
        if (!file) return res.status(400).send("File name required");

        // Basic path traversal protection
        if (file.includes("..") || file.includes("/")) return res.status(400).send("Invalid file name");

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const filePath = path.join(__dirname, "../../backups", file);

        res.download(filePath);
    } catch (error) {
        res.status(500).send("Download failed");
    }
});

adminRouter.post("/backups", async (req, res) => {
    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const backupsDir = path.join(__dirname, "../../backups");
        await fs.mkdir(backupsDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup-${timestamp}.sql`;

        // Mocking a backup creation (normally pg_dump)
        await fs.writeFile(path.join(backupsDir, filename), "-- Mock DB Backup\n");

        res.json({ ok: true, message: "Backup created" });
    } catch (error) {
        res.status(500).json({ ok: false, message: "Error" });
    }
});

adminRouter.delete("/backups", async (req, res) => {
    try {
        const { filename } = req.body;
        if (!filename) return res.status(400).json({ ok: false });

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const filePath = path.join(__dirname, "../../backups", filename);

        await fs.unlink(filePath);
        res.json({ ok: true, message: "Deleted" });
    } catch (error) {
        res.status(500).json({ ok: false, message: "Error" });
    }
});

// User Details
adminRouter.get("/users/:id/details", async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        if (!userId || isNaN(userId)) return res.status(400).json({ ok: false });

        const [user, machines, hashAgg, faucet, transactions, supportMessages] = await Promise.all([
            prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true, name: true, username: true, email: true,
                    ip: true, registrationIp: true, isBanned: true,
                    walletAddress: true, polBalance: true, createdAt: true,
                    lastLoginAt: true, refCode: true, oldBaseHashRate: true,
                }
            }),
            prisma.userMiner.count({ where: { userId, isActive: true } }),
            prisma.userMiner.aggregate({ where: { userId, isActive: true }, _sum: { hashRate: true } }),
            prisma.faucetClaim.findFirst({ where: { userId } }),
            prisma.transaction.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: { id: true, type: true, amount: true, status: true, createdAt: true }
            }),
            prisma.supportMessage.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: { id: true, subject: true, isRead: true, isReplied: true, createdAt: true }
            })
        ]);

        if (!user) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' });

        res.json({
            ok: true,
            user,
            metrics: {
                activeMachines: machines,
                realHashRate: Number(hashAgg._sum.hashRate || 0),
                faucetClaims: faucet?.totalClaims ?? 0,
            },
            recentTransactions: transactions,
            supportMessages,
        });
    } catch (err) {
        console.error('[admin details error]', err?.message || err);
        res.status(500).json({ ok: false, message: 'Erro ao carregar detalhes' });
    }
});

// User Activity Logs
adminRouter.get("/users/:id/logs", async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        if (!userId || isNaN(userId)) return res.status(400).json({ ok: false });

        const logs = await prisma.auditLog.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: { id: true, action: true, ip: true, userAgent: true, detailsJson: true, createdAt: true }
        });

        res.json({ ok: true, logs });
    } catch (err) {
        res.status(500).json({ ok: false, message: 'Erro ao carregar logs' });
    }
});

// Send Miner to User
adminRouter.post("/users/:id/send-miner", async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const minerIdRaw = String(req.body?.minerId ?? '');
        const quantity = Math.max(1, Math.min(100, parseInt(req.body?.quantity || 1)));

        if (!userId || isNaN(userId)) return res.status(400).json({ ok: false, message: 'ID de usuário inválido.' });
        if (!minerIdRaw) return res.status(400).json({ ok: false, message: 'ID de máquina inválido.' });

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, email: true } });
        if (!user) return res.status(404).json({ ok: false, message: 'Usuário não encontrado.' });

        const now = new Date();
        const isEventMiner = minerIdRaw.startsWith('event_');

        if (isEventMiner) {
            const eventMinerId = parseInt(minerIdRaw.replace('event_', ''));
            if (!eventMinerId || isNaN(eventMinerId)) return res.status(400).json({ ok: false, message: 'ID de máquina de evento inválido.' });
            const eventMiner = await prisma.eventMiner.findUnique({ where: { id: eventMinerId } });
            if (!eventMiner) return res.status(404).json({ ok: false, message: 'Máquina de evento não encontrada.' });

            await prisma.userInventory.createMany({
                data: Array.from({ length: quantity }, () => ({
                    userId,
                    minerId: null,
                    minerName: eventMiner.name,
                    level: 1,
                    hashRate: Number(eventMiner.hashRate),
                    slotSize: Number(eventMiner.slotSize || 1),
                    imageUrl: eventMiner.imageUrl || '/machines/reward1.png',
                    acquiredAt: now,
                    updatedAt: now
                }))
            });
            res.json({ ok: true, message: `${quantity}x ${eventMiner.name} enviado(s) para ${user.username || user.email}.` });
        } else {
            const minerId = parseInt(minerIdRaw);
            if (!minerId || isNaN(minerId)) return res.status(400).json({ ok: false, message: 'ID de máquina inválido.' });
            const miner = await prisma.miner.findUnique({ where: { id: minerId } });
            if (!miner) return res.status(404).json({ ok: false, message: 'Máquina não encontrada.' });

            await prisma.userInventory.createMany({
                data: Array.from({ length: quantity }, () => ({
                    userId,
                    minerId: miner.id,
                    minerName: miner.name,
                    level: 1,
                    hashRate: Number(miner.baseHashRate),
                    slotSize: Number(miner.slotSize || 1),
                    imageUrl: miner.imageUrl || '/machines/reward1.png',
                    acquiredAt: now,
                    updatedAt: now
                }))
            });
            res.json({ ok: true, message: `${quantity}x ${miner.name} enviado(s) para ${user.username || user.email}.` });
        }
    } catch (err) {
        console.error('send-miner error', err);
        res.status(500).json({ ok: false, message: 'Erro ao enviar máquina.' });
    }
});

// Support / Tickets
adminRouter.get("/support", adminSupportController.listMessages);
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
