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
const logger = loggerLib.child("analytics.routes");
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


// Dashboard Stats
router.get("/stats", adminController.getStats);

// Analytics
router.get("/analytics", async (req, res) => {
    try {
        const { period = 'month', userId: userIdQuery } = req.query;

        // POL price
        let polPrice = 0.35;
        try { polPrice = await getPolUsdPrice(); } catch {}

        const userIdNum = queryPositiveInt(userIdQuery);

        // Engine constants
        const BLOCK_REWARD = 0.30;      // POL per block
        const BLOCK_DURATION_MS = 10 * 60 * 1000; // 10 min
        const BLOCKS_PER_DAY = (24 * 60 * 60 * 1000) / BLOCK_DURATION_MS; // 144
        const BLOCKS_PER_MONTH = BLOCKS_PER_DAY * 30;
        const BLOCKS_PER_YEAR = BLOCKS_PER_DAY * 365;

        const now = new Date();
        let since: Date;
        type MonthBucket = { label: string; year: number; month: number; day?: number };
        const months: MonthBucket[] = [];
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

        const userFilter = userIdNum !== undefined ? { userId: userIdNum } : {};

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
            userIdNum !== undefined ? Promise.resolve(null) : prisma.blockMinerReward.groupBy({
                by: ['userId'],
                _sum: { rewardAmount: true },
                orderBy: { _sum: { rewardAmount: 'desc' } },
                take: 10,
            }),
            (async () => {
                const unit = period === 'year' ? 'month' : 'day';
                const userClause = userIdNum !== undefined ? Prisma.sql`AND user_id = ${userIdNum}` : Prisma.empty;
                return prisma.$queryRaw<Array<{ bucket: Date; total: number }>>(Prisma.sql`
                    SELECT date_trunc(${unit}, created_at) AS bucket,
                           COALESCE(SUM(reward_amount), 0)::float8 AS total
                    FROM block_miner_rewards
                    WHERE created_at >= ${since} ${userClause}
                    GROUP BY 1
                `);
            })(),
            prisma.transaction.aggregate({ _sum: { amount: true }, where: { ...userFilter, type: 'withdrawal', status: 'completed' } }),
            prisma.transaction.aggregate({ _sum: { amount: true }, where: { ...userFilter, type: 'withdrawal', status: 'completed', createdAt: { gte: since } } }),
            userIdNum !== undefined ? Promise.resolve(null) : prisma.blockMinerReward.groupBy({ by: ['userId'], where: { createdAt: { gte: since } } }).then(r => r.length),
            userIdNum !== undefined ? Promise.resolve(null) : prisma.blockDistribution.count({ where: { createdAt: { gte: since } } }),
            prisma.blockDistribution.count(),
            // Network hashrate: sum hashRate of all active userMiners
            prisma.userMiner.aggregate({ _sum: { hashRate: true }, where: { isActive: true } }),
        ]);

        // User-specific hashrate for forecast
        let userHashRate = 0;
        if (userIdNum !== undefined) {
            const uhr = await prisma.userMiner.aggregate({ _sum: { hashRate: true }, where: { userId: userIdNum, isActive: true } });
            userHashRate = Number(uhr._sum.hashRate || 0);
        }

        const networkHashRate = Number(networkHashData._sum.hashRate || 1);

        // --- FORECAST ---
        // Share = userHashRate / networkHashRate (if no user, show total network)
        const shareRatio = userIdNum !== undefined && networkHashRate > 0 ? userHashRate / networkHashRate : 1;
        const forecastDay   = BLOCKS_PER_DAY   * BLOCK_REWARD * shareRatio;
        const forecastWeek  = BLOCKS_PER_DAY * 7 * BLOCK_REWARD * shareRatio;
        const forecastMonth = BLOCKS_PER_MONTH * BLOCK_REWARD * shareRatio;
        const forecastYear  = BLOCKS_PER_YEAR  * BLOCK_REWARD * shareRatio;

        // Build top earners with user info
        type TopEarnerRow = { userId: number; username: string; total: number; totalUsd: number };
        let topEarnersWithInfo: TopEarnerRow[] = [];
        if (topEarners) {
            const userIds = topEarners.map(e => e.userId);
            const users = await prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, username: true, email: true }
            });
            const uMap: Record<number, { id: number; username: string | null; email: string }> = Object.fromEntries(
              users.map((u) => [u.id, u]),
            );
            topEarnersWithInfo = topEarners.map(e => ({
                userId: e.userId,
                username: uMap[e.userId]?.username || uMap[e.userId]?.email || `#${e.userId}`,
                total: Number(e._sum.rewardAmount || 0),
                totalUsd: Number(e._sum.rewardAmount || 0) * polPrice,
            }));
        }

        // Chart buckets
        const buckets: Record<string, number> = {};
        for (const r of rewardsOverTime) {
            const d = new Date(r.bucket);
            let key;
            if (period === 'year') {
                key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            } else {
                key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            }
            buckets[key] = (buckets[key] || 0) + Number(r.total);
        }

        const chartData = months.map(m => {
            let key;
            if (period === 'year') {
                key = `${m.year}-${String(m.month).padStart(2, '0')}`;
            } else {
                key = `${m.year}-${String(m.month).padStart(2, '0')}-${String(m.day ?? 0).padStart(2, '0')}`;
            }
            const pol = Number((buckets[key] || 0).toFixed(8));
            return { label: m.label, value: pol, valueUsd: pol * polPrice };
        });

        type UserRecentBlockRow = Prisma.BlockMinerRewardGetPayload<{
          include: { block: { select: { blockNumber: true; reward: true } } };
        }>;
        let userRecentBlocks: UserRecentBlockRow[] | null = null;
        if (userIdNum !== undefined) {
            userRecentBlocks = await prisma.blockMinerReward.findMany({
                where: { userId: userIdNum },
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
                userHashRate: userIdNum !== undefined ? userHashRate : null,
                period,
            },
            forecast: {
                day:   { pol: forecastDay,   usd: forecastDay   * polPrice },
                week:  { pol: forecastWeek,  usd: forecastWeek  * polPrice },
                month: { pol: forecastMonth, usd: forecastMonth * polPrice },
                year:  { pol: forecastYear,  usd: forecastYear  * polPrice },
                sharePercent: userIdNum !== undefined ? (shareRatio * 100) : null,
                networkHashRate,
                userHashRate: userIdNum !== undefined ? userHashRate : null,
            },
            topEarners: topEarnersWithInfo,
            chartData,
            userRecentBlocks,
        });
    } catch (err) {
        logger.error('[admin analytics error]', { error: String(adminErrMessage(err)) });
        res.status(500).json({ ok: false, message: 'Erro ao carregar analytics.' });
    }
});

// ---------- Analytics extra tabs ----------
type AnalyticsPeriod = "week" | "month" | "year";

function resolveAnalyticsPeriod(raw: unknown): { period: AnalyticsPeriod; since: Date; buckets: { label: string; from: Date; to: Date }[]; bucketUnit: "day" | "month" } {
    const period: AnalyticsPeriod = raw === "week" ? "week" : raw === "year" ? "year" : "month";
    const now = new Date();
    const buckets: { label: string; from: Date; to: Date }[] = [];
    let since: Date;
    if (period === "week") {
        since = new Date(now); since.setUTCDate(since.getUTCDate() - 6); since.setUTCHours(0,0,0,0);
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now); d.setUTCDate(d.getUTCDate() - i); d.setUTCHours(0,0,0,0);
            const end = new Date(d); end.setUTCDate(end.getUTCDate() + 1);
            buckets.push({ label: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`, from: d, to: end });
        }
        return { period, since, buckets, bucketUnit: "day" };
    }
    if (period === "year") {
        since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
        for (let i = 11; i >= 0; i--) {
            const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
            const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
            buckets.push({ label: d.toLocaleString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }), from: d, to: end });
        }
        return { period, since, buckets, bucketUnit: "month" };
    }
    since = new Date(now); since.setUTCDate(since.getUTCDate() - 29); since.setUTCHours(0,0,0,0);
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now); d.setUTCDate(d.getUTCDate() - i); d.setUTCHours(0,0,0,0);
        const end = new Date(d); end.setUTCDate(end.getUTCDate() + 1);
        buckets.push({ label: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`, from: d, to: end });
    }
    return { period, since, buckets, bucketUnit: "day" };
}

function bucketKey(d: Date, unit: "day" | "month"): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    if (unit === "month") return `${y}-${m}`;
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

// Inflation: per-bucket POL distributed (mining) vs POL withdrawn, cumulative supply curve
router.get("/analytics/inflation", async (req, res) => {
    try {
        const { period, since, buckets, bucketUnit } = resolveAnalyticsPeriod(req.query.period);
        let polPrice = 0.35; try { polPrice = await getPolUsdPrice(); } catch {}

        const unit = bucketUnit === "month" ? "month" : "day";
        const [distributedBuckets, withdrawalBuckets, totalDistributedAgg, totalWithdrawnAgg] = await Promise.all([
            prisma.$queryRaw<Array<{ bucket: Date; total: number }>>(Prisma.sql`
                SELECT date_trunc(${unit}, created_at) AS bucket, COALESCE(SUM(reward_amount), 0)::float8 AS total
                FROM block_miner_rewards WHERE created_at >= ${since} GROUP BY 1
            `),
            prisma.$queryRaw<Array<{ bucket: Date; total: number }>>(Prisma.sql`
                SELECT date_trunc(${unit}, created_at) AS bucket, COALESCE(SUM(amount), 0)::float8 AS total
                FROM transactions WHERE type = 'withdrawal' AND status = 'completed' AND created_at >= ${since} GROUP BY 1
            `),
            prisma.blockMinerReward.aggregate({ _sum: { rewardAmount: true } }),
            prisma.transaction.aggregate({ _sum: { amount: true }, where: { type: "withdrawal", status: "completed" } }),
        ]);

        const distMap: Record<string, number> = {};
        for (const r of distributedBuckets) {
            distMap[bucketKey(new Date(r.bucket), bucketUnit)] = Number(r.total || 0);
        }
        const wMap: Record<string, number> = {};
        for (const r of withdrawalBuckets) {
            wMap[bucketKey(new Date(r.bucket), bucketUnit)] = Number(r.total || 0);
        }

        const totalDistributedAll = Number(totalDistributedAgg._sum.rewardAmount || 0);
        const totalWithdrawnAll = Number(totalWithdrawnAgg._sum.amount || 0);
        // Cumulative supply at start of window = total - sum(window distributed) + sum(window withdrawn) -- approximate net curve
        const periodDistributedTotal = Object.values(distMap).reduce((s, n) => s + n, 0);
        const periodWithdrawnTotal = Object.values(wMap).reduce((s, n) => s + n, 0);
        let cumulative = totalDistributedAll - periodDistributedTotal + periodWithdrawnTotal; // net at start of window

        const series = buckets.map(b => {
            const k = bucketKey(b.from, bucketUnit);
            const distributed = Number((distMap[k] || 0).toFixed(8));
            const withdrawn = Number((wMap[k] || 0).toFixed(8));
            const net = distributed - withdrawn;
            cumulative += net;
            return { label: b.label, distributed, withdrawn, net: Number(net.toFixed(8)), cumulative: Number(cumulative.toFixed(8)) };
        });

        const avgDailyDistributed = bucketUnit === "day" && series.length > 0 ? periodDistributedTotal / series.length : 0;
        const avgDailyWithdrawn = bucketUnit === "day" && series.length > 0 ? periodWithdrawnTotal / series.length : 0;
        const netInflationRate = totalDistributedAll > 0 ? ((totalDistributedAll - totalWithdrawnAll) / totalDistributedAll) * 100 : 0;

        res.json({
            ok: true,
            period,
            polPrice,
            series,
            totals: {
                allTimeDistributed: totalDistributedAll,
                allTimeWithdrawn: totalWithdrawnAll,
                periodDistributed: periodDistributedTotal,
                periodWithdrawn: periodWithdrawnTotal,
                circulatingNet: totalDistributedAll - totalWithdrawnAll,
                netInflationRatePercent: netInflationRate,
                avgDailyDistributed,
                avgDailyWithdrawn,
            },
        });
    } catch (err) {
        logger.error("[admin analytics inflation error]", { error: String(adminErrMessage(err)) });
        res.status(500).json({ ok: false, message: "Erro ao carregar inflação." });
    }
});

// Projections: 7/30/90 day forecasts using network hashrate
router.get("/analytics/projections", async (req, res) => {
    try {
        const userIdNum = queryPositiveInt(req.query.userId);
        let polPrice = 0.35; try { polPrice = await getPolUsdPrice(); } catch {}

        const BLOCK_REWARD = 0.30;
        const BLOCKS_PER_DAY = 144;

        const [netAgg, userAgg, last30Agg] = await Promise.all([
            prisma.userMiner.aggregate({ _sum: { hashRate: true }, where: { isActive: true } }),
            userIdNum !== undefined
                ? prisma.userMiner.aggregate({ _sum: { hashRate: true }, where: { isActive: true, userId: userIdNum } })
                : Promise.resolve(null),
            prisma.blockMinerReward.aggregate({
                _sum: { rewardAmount: true },
                _count: { _all: true },
                where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
            }),
        ]);

        const networkHashRate = Number(netAgg._sum.hashRate || 0);
        const userHashRate = userAgg ? Number(userAgg._sum.hashRate || 0) : 0;
        const share = userIdNum !== undefined && networkHashRate > 0 ? userHashRate / networkHashRate : 1;

        // Theoretical projection
        const theo = (days: number) => BLOCKS_PER_DAY * BLOCK_REWARD * share * days;

        // Empirical projection from last 30d actuals
        const last30Total = Number(last30Agg._sum.rewardAmount || 0);
        const empiricalDaily = last30Agg._count._all > 0 ? last30Total / 30 : 0;
        const empirical = (days: number) => empiricalDaily * (userIdNum !== undefined ? share : 1) * days;

        res.json({
            ok: true,
            polPrice,
            networkHashRate,
            userHashRate: userIdNum !== undefined ? userHashRate : null,
            sharePercent: userIdNum !== undefined ? share * 100 : null,
            theoretical: {
                day1: theo(1), day7: theo(7), day30: theo(30), day90: theo(90), day365: theo(365),
            },
            empirical: {
                avgDailyLast30: empiricalDaily * (userIdNum !== undefined ? share : 1),
                day7: empirical(7), day30: empirical(30), day90: empirical(90),
            },
            assumptions: { blockRewardPol: BLOCK_REWARD, blocksPerDay: BLOCKS_PER_DAY },
        });
    } catch (err) {
        logger.error("[admin analytics projections error]", { error: String(adminErrMessage(err)) });
        res.status(500).json({ ok: false, message: "Erro ao carregar projeções." });
    }
});

// Withdrawal stats: mean / median / P90 / time-to-complete, period series
router.get("/analytics/withdrawals", async (req, res) => {
    try {
        const { period, since, buckets, bucketUnit } = resolveAnalyticsPeriod(req.query.period);
        const userIdNum = queryPositiveInt(req.query.userId);
        let polPrice = 0.35; try { polPrice = await getPolUsdPrice(); } catch {}

        const unit = bucketUnit === "month" ? "month" : "day";
        const userClause = userIdNum !== undefined ? Prisma.sql`AND user_id = ${userIdNum}` : Prisma.empty;

        const [statsRow, statusRows, seriesRows] = await Promise.all([
            prisma.$queryRaw<Array<{
                cnt: bigint; total: number | null; avg: number | null;
                median: number | null; p90: number | null; p99: number | null;
                avg_ttc_ms: number | null; median_ttc_ms: number | null;
            }>>(Prisma.sql`
                SELECT
                    COUNT(*) AS cnt,
                    COALESCE(SUM(amount), 0)::float8 AS total,
                    COALESCE(AVG(amount), 0)::float8 AS avg,
                    COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY amount), 0)::float8 AS median,
                    COALESCE(percentile_cont(0.9) WITHIN GROUP (ORDER BY amount), 0)::float8 AS p90,
                    COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY amount), 0)::float8 AS p99,
                    COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000) FILTER (WHERE completed_at IS NOT NULL AND completed_at >= created_at), 0)::float8 AS avg_ttc_ms,
                    COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000) FILTER (WHERE completed_at IS NOT NULL AND completed_at >= created_at), 0)::float8 AS median_ttc_ms
                FROM transactions
                WHERE type = 'withdrawal' AND status = 'completed' ${userClause}
            `),
            prisma.$queryRaw<Array<{ status: string; cnt: bigint }>>(Prisma.sql`
                SELECT LOWER(status) AS status, COUNT(*) AS cnt
                FROM transactions
                WHERE type = 'withdrawal' AND created_at >= ${since} ${userClause}
                GROUP BY 1
            `),
            prisma.$queryRaw<Array<{ bucket: Date; cnt: bigint; amount: number }>>(Prisma.sql`
                SELECT date_trunc(${unit}, created_at) AS bucket,
                       COUNT(*) AS cnt,
                       COALESCE(SUM(amount), 0)::float8 AS amount
                FROM transactions
                WHERE type = 'withdrawal' AND status = 'completed' AND created_at >= ${since} ${userClause}
                GROUP BY 1
            `),
        ]);

        const s = statsRow[0] ?? { cnt: 0n, total: 0, avg: 0, median: 0, p90: 0, p99: 0, avg_ttc_ms: 0, median_ttc_ms: 0 };

        const statusCount = { completed: 0, pending: 0, failed: 0, other: 0 };
        for (const r of statusRows) {
            const n = Number(r.cnt);
            if (r.status === "completed") statusCount.completed += n;
            else if (r.status === "pending") statusCount.pending += n;
            else if (r.status === "failed") statusCount.failed += n;
            else statusCount.other += n;
        }

        const bucketMap: Record<string, { count: number; amount: number }> = {};
        for (const r of seriesRows) {
            bucketMap[bucketKey(new Date(r.bucket), bucketUnit)] = { count: Number(r.cnt), amount: Number(r.amount || 0) };
        }
        const series = buckets.map(b => {
            const k = bucketKey(b.from, bucketUnit);
            const cur = bucketMap[k] || { count: 0, amount: 0 };
            return { label: b.label, count: cur.count, amount: Number(cur.amount.toFixed(8)) };
        });

        res.json({
            ok: true,
            period,
            polPrice,
            stats: {
                completedCount: Number(s.cnt),
                totalAmount: Number(s.total || 0),
                avg: Number(s.avg || 0),
                median: Number(s.median || 0),
                p90: Number(s.p90 || 0),
                p99: Number(s.p99 || 0),
                avgTimeToCompleteMs: Number(s.avg_ttc_ms || 0),
                medianTimeToCompleteMs: Number(s.median_ttc_ms || 0),
            },
            statusBreakdownPeriod: statusCount,
            series,
        });
    } catch (err) {
        logger.error("[admin analytics withdrawals error]", { error: String(adminErrMessage(err)) });
        res.status(500).json({ ok: false, message: "Erro ao carregar saques." });
    }
});

// Distribution by source: aggregate POL credited per source over the period.
router.get("/analytics/distribution", async (req, res) => {
    try {
        const { period, since } = resolveAnalyticsPeriod(req.query.period);
        const userIdNum = queryPositiveInt(req.query.userId);
        let polPrice = 0.35; try { polPrice = await getPolUsdPrice(); } catch {}
        const userFilter = userIdNum !== undefined ? { userId: userIdNum } : {};
        const referrerFilter = userIdNum !== undefined ? { referrerId: userIdNum } : {};

        const [
            miningAgg,
            referralAgg,
            zeradsAgg,
            offerwallMeAgg,
            inboxAgg,
            withdrawalsAgg,
            depositsAgg,
        ] = await Promise.all([
            prisma.blockMinerReward.aggregate({ _sum: { rewardAmount: true }, _count: { _all: true }, where: { ...userFilter, createdAt: { gte: since } } }),
            prisma.referralEarning.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { ...referrerFilter, createdAt: { gte: since } } }),
            prisma.zeradsCallback.aggregate({ _sum: { payoutAmount: true }, _count: { _all: true }, where: { ...userFilter, createdAt: { gte: since } } }),
            prisma.offerwallMeCallback.aggregate({ _sum: { polCredited: true }, _count: { _all: true }, where: { ...userFilter, createdAt: { gte: since } } }),
            prisma.userRewardInbox.aggregate({ _sum: { rewardValue: true }, _count: { _all: true }, where: { ...userFilter, status: "collected", collectedAt: { gte: since } } }),
            prisma.transaction.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { ...userFilter, type: "withdrawal", status: "completed", createdAt: { gte: since } } }),
            prisma.transaction.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { ...userFilter, type: "deposit", status: "completed", createdAt: { gte: since } } }),
        ]);

        const sources = [
            { key: "mining", label: "Mineração (blocos)", pol: Number(miningAgg._sum.rewardAmount || 0), count: miningAgg._count._all },
            { key: "referral", label: "Indicações", pol: Number(referralAgg._sum.amount || 0), count: referralAgg._count._all },
            { key: "zerads", label: "PTC (ZerAds)", pol: Number(zeradsAgg._sum.payoutAmount || 0), count: zeradsAgg._count._all },
            { key: "offerwallme", label: "Offerwall (OfferwallMe)", pol: Number(offerwallMeAgg._sum.polCredited || 0), count: offerwallMeAgg._count._all },
            { key: "inbox", label: "Inbox de recompensas (faucet/checkin/tasks)", pol: Number(inboxAgg._sum.rewardValue || 0), count: inboxAgg._count._all },
        ];
        const inflowTotal = sources.reduce((s, x) => s + x.pol, 0);

        const outflows = [
            { key: "withdrawals", label: "Saques", pol: Number(withdrawalsAgg._sum.amount || 0), count: withdrawalsAgg._count._all },
        ];
        const depositsInflow = { key: "deposits", label: "Depósitos (entrada externa)", pol: Number(depositsAgg._sum.amount || 0), count: depositsAgg._count._all };

        res.json({
            ok: true,
            period,
            polPrice,
            sources: sources.map(s => ({ ...s, sharePercent: inflowTotal > 0 ? (s.pol / inflowTotal) * 100 : 0 })),
            totalInflowFromSources: inflowTotal,
            depositsInflow,
            outflows,
        });
    } catch (err) {
        logger.error("[admin analytics distribution error]", { error: String(adminErrMessage(err)) });
        res.status(500).json({ ok: false, message: "Erro ao carregar distribuição." });
    }
});
