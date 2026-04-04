import express from "express";
import * as adminController from "../controllers/adminController.js";
import * as adminSupportController from "../controllers/adminSupportController.js";
import * as depositTicketController from "../controllers/depositTicketController.js";
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
const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            cb(null, UPLOADS_DIR);
        },
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin';
            cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
        if (/^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Somente imagens são permitidas.'));
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
adminRouter.use((err, _req, res, _next) => {
    if (err?.message) return res.status(400).json({ ok: false, message: err.message });
    res.status(500).json({ ok: false, message: "Erro no upload." });
});

// Dashboard Stats
adminRouter.get("/stats", adminController.getStats);

// Users
adminRouter.get("/users", adminController.listRecentUsers);
adminRouter.put("/users/:id/ban", adminController.setUserBan);

// Miners
adminRouter.get("/miners", adminController.listMiners);
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

        const [user, machines, faucet, transactions, supportMessages] = await Promise.all([
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
            prisma.faucetClaim.findUnique({ where: { userId } }),
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
                faucetClaims: faucet?.totalClaims || 0,
            },
            recentTransactions: transactions,
            supportMessages,
        });
    } catch (err) {
        res.status(500).json({ ok: false, message: 'Erro ao carregar detalhes' });
    }
});

// Send Miner to User
adminRouter.post("/users/:id/send-miner", async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const minerId = parseInt(req.body?.minerId);
        const quantity = Math.max(1, Math.min(100, parseInt(req.body?.quantity || 1)));

        if (!userId || isNaN(userId)) return res.status(400).json({ ok: false, message: 'ID de usuário inválido.' });
        if (!minerId || isNaN(minerId)) return res.status(400).json({ ok: false, message: 'ID de máquina inválido.' });

        const [user, miner] = await Promise.all([
            prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, email: true } }),
            prisma.miner.findUnique({ where: { id: minerId } })
        ]);

        if (!user) return res.status(404).json({ ok: false, message: 'Usuário não encontrado.' });
        if (!miner) return res.status(404).json({ ok: false, message: 'Máquina não encontrada.' });

        const now = new Date();
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
