import type { Request, Response } from "express";
import * as serverDatabaseModel from "../../models/database/serverDatabaseModel.js";
import { notifyMiniPassYoutubeWatch } from "../../services/miniPass/miniPassMissionHookService.js";
import { readErrorMessage } from "../../shared/errors/httpStatusError.js";
import * as serverDatabaseAdminData from "./serverDatabaseAdminData.js";

type LoggerLike = {
  error: (msg: string, meta?: Record<string, unknown>) => void;
};

type IoLike = {
  emit: (event: string, payload: unknown) => void;
};

type PublicStateServiceLike = {
  getActiveMiningRoomHashRateTotal: () => Promise<unknown>;
  getActiveMiniGameHashRateTotal: () => Promise<unknown>;
  getActiveYoutubeHashRateTotal: () => Promise<unknown>;
  getUserMiniGameHashRate: (userId: number) => Promise<unknown>;
  getUserYoutubeHashRate: (userId: number) => Promise<unknown>;
  syncUserBaseHashRate: (userId: number) => Promise<unknown>;
};

type EngineLike = {
  rewardBase?: number;
  tokenSymbol?: string;
};

function createServerDatabaseController({
  logger,
  io,
  publicStateService,
  engine,
  onlineStartDate,
  youtubeRewardGh,
  youtubeWatchClaimIntervalMs,
  youtubeWatchBoostDurationMs,
  chatMaxMessages
}: {
  logger: LoggerLike;
  io: IoLike;
  publicStateService: PublicStateServiceLike;
  engine: EngineLike;
  onlineStartDate: string;
  youtubeRewardGh: number;
  youtubeWatchClaimIntervalMs: number;
  youtubeWatchBoostDurationMs: number;
  chatMaxMessages: number;
}) {
  async function getAdminUserDetails(req: Request, res: Response): Promise<void> {
    try {
      const userId = Number(req.params.id);
      const data = await serverDatabaseAdminData.fetchAdminUserDetails(userId, Date.now());
      const { user, faucet, shortlink, autoGpu, inventory, activeMachines, checkins, youtubeWatch, recentTx, recentPayouts } = data;

      if (!user) {
        res.status(404).json({ ok: false, message: "User not found." });
        return;
      }

      res.json({
        ok: true,
        user,
        metrics: {
          faucetClaims: Number(faucet?.total_claims || 0),
          shortlinkDailyRuns: Number(shortlink?.daily_runs || 0),
          shortlinkCurrentStep: Number(shortlink?.current_step || 0),
          autoGpuClaims: Number(autoGpu?.claims || 0),
          autoGpuTotalHash: Number(autoGpu?.total_hash || 0),
          youtubeWatchClaims: Number(youtubeWatch?.claims || 0),
          youtubeWatchTotalHashGranted: Number(youtubeWatch?.total_hash_granted || 0),
          youtubeWatchActiveHash: Number(youtubeWatch?.active_hash || 0),
          inventoryItems: Number(inventory?.count || 0),
          activeMachines: Number(activeMachines?.count || 0),
          totalCheckins: Number(checkins?.count || 0)
        },
        shortlink: {
          completedAt: shortlink?.completed_at || null,
          resetAt: shortlink?.reset_at || null
        },
        faucet: {
          dayKey: faucet?.day_key || null
        },
        recentTransactions: recentTx || [],
        recentPayouts: recentPayouts || []
      });
    } catch (error: unknown) {
      logger.error("Admin user details failed", { error: readErrorMessage(error), userId: req.params?.id });
      res.status(500).json({ ok: false, message: "Unable to load user details." });
    }
  }

  async function getAdminFinanceOverview(_req: Request, res: Response): Promise<void> {
    try {
      const data = await serverDatabaseAdminData.fetchAdminFinanceOverview(Date.now() - 24 * 60 * 60 * 1000);
      const { pool, payouts, withdrawals, pendingWithdrawals, deposits24h } = data;

      res.json({
        ok: true,
        overview: {
          poolBalance: Number(pool?.total_pool || 0),
          lifetimeMined: Number(pool?.lifetime_mined || 0),
          totalPaidPayouts: Number(payouts?.total_paid || 0),
          totalWithdrawn: Number(withdrawals?.total_withdrawn || 0),
          pendingWithdrawals: Number(pendingWithdrawals?.total_pending || 0),
          deposits24h: Number(deposits24h?.total_deposits_24h || 0)
        }
      });
    } catch (error: unknown) {
      logger.error("Admin finance overview failed", { error: readErrorMessage(error) });
      res.status(500).json({ ok: false, message: "Unable to load finance overview." });
    }
  }

  async function getAdminFinanceActivity(req: Request, res: Response): Promise<void> {
    try {
      const page = Math.max(1, Number(req.query?.page || 1));
      const pageSize = Math.max(5, Math.min(100, Number(req.query?.pageSize || req.query?.limit || 30)));
      const offset = (page - 1) * pageSize;
      const search = String(req.query?.q || "").trim().toLowerCase();
      const txType = String(req.query?.type || "").trim().toLowerCase();
      const txStatus = String(req.query?.status || "").trim().toLowerCase();
      const fromDate = String(req.query?.from || "").trim();
      const toDate = String(req.query?.to || "").trim();

      const txFrom =
        fromDate && Number.isFinite(Date.parse(`${fromDate}T00:00:00Z`))
          ? new Date(`${fromDate}T00:00:00Z`)
          : null;
      const txTo =
        toDate && Number.isFinite(Date.parse(`${toDate}T23:59:59.999Z`))
          ? new Date(`${toDate}T23:59:59.999Z`)
          : null;

      const data = await serverDatabaseAdminData.fetchAdminFinanceActivity({
        search,
        txType,
        txStatus,
        txFrom,
        txTo,
        payoutFrom: txFrom,
        payoutTo: txTo,
        pageSize,
        offset
      });

      res.json({
        ok: true,
        page,
        pageSize,
        transactionsTotal: Number(data.txTotalRow?.total || 0),
        payoutsTotal: Number(data.payoutsTotalRow?.total || 0),
        transactions: data.transactions,
        payouts: data.payoutsData
      });
    } catch (error: unknown) {
      logger.error("Admin finance activity failed", { error: readErrorMessage(error) });
      res.status(500).json({ ok: false, message: "Unable to load finance activity." });
    }
  }

  async function getAdminYoutubeStats(req: Request, res: Response): Promise<void> {
    try {
      const now = Date.now();
      const dayAgo = now - 24 * 60 * 60 * 1000;
      const data = await serverDatabaseAdminData.fetchAdminYoutubeStats(now, dayAgo);

      res.json({
        ok: true,
        stats: {
          rewardPerMinuteGh: youtubeRewardGh,
          durationHours: Math.round((youtubeWatchBoostDurationMs / (60 * 60 * 1000)) * 100) / 100,
          activeHashRate: Number(data.activeHashRow?.total || 0),
          activeUsers: Number(data.activeUsersRow?.total || 0),
          claimsTotal: Number(data.totalsRow?.claims || 0),
          hashGrantedTotal: Number(data.totalsRow?.hash_granted || 0),
          claims24h: Number(data.dayRow?.claims_24h || 0),
          hashGranted24h: Number(data.dayRow?.hash_granted_24h || 0),
          users24h: Number(data.dayRow?.users_24h || 0)
        }
      });
    } catch (error: unknown) {
      logger.error("Admin YouTube stats failed", {
        error: readErrorMessage(error),
        adminId: req.admin?.role ?? null
      });
      res.status(500).json({ ok: false, message: "Unable to load YouTube stats." });
    }
  }

  async function getAdminYoutubeHistory(req: Request, res: Response): Promise<void> {
    try {
      const page = Math.max(1, Number(req.query?.page || 1));
      const pageSize = Math.max(5, Math.min(200, Number(req.query?.pageSize || 30)));
      const offset = (page - 1) * pageSize;
      const userId = Number(req.query?.userId || 0);

      const data = await serverDatabaseAdminData.fetchAdminYoutubeHistory({
        userId,
        pageSize,
        offset
      });
      res.json({ ok: true, page, pageSize, total: Number(data.totalRow?.total || 0), rows: data.rows });
    } catch (error: unknown) {
      logger.error("Admin YouTube history failed", {
        error: readErrorMessage(error),
        adminId: req.admin?.role ?? null
      });
      res.status(500).json({ ok: false, message: "Unable to load YouTube history." });
    }
  }

  async function listChatMessages(_req: Request, res: Response): Promise<void> {
    try {
      const rows = await serverDatabaseModel.listChatMessages(chatMaxMessages);
      const messages = rows.reverse().map((row) => ({
        id: row.id,
        userId: row.userId,
        username: String(row.username || "Miner"),
        message: String(row.message || ""),
        createdAt: row.createdAt.getTime()
      }));

      res.json({ ok: true, messages });
    } catch (error: unknown) {
      logger.error("Chat messages load failed", { error: readErrorMessage(error) });
      res.status(500).json({ ok: false, message: "Unable to load chat messages." });
    }
  }

  async function createChatMessage(req: Request, res: Response): Promise<void> {
    try {
      const userId = Number(req.user?.id || 0);
      const username = String(req.user?.username || req.user?.name || `User#${userId || "guest"}`).trim();
      const message = String(req.body?.message || "").trim();

      if (!message) {
        res.status(400).json({ ok: false, message: "Message is required." });
        return;
      }

      const createdAt = Date.now();
      const insertResult = await serverDatabaseModel.insertChatMessage({ userId, username, message, createdAt });

      const item = {
        id: insertResult.id,
        userId,
        username,
        message,
        createdAt
      };

      io.emit("chat:new-message", item);
      res.json({ ok: true, message: item });
    } catch (error: unknown) {
      logger.error("Chat message send failed", {
        error: readErrorMessage(error),
        userId: req.user?.id ?? null
      });
      res.status(500).json({ ok: false, message: "Unable to send chat message." });
    }
  }

  async function getLandingStats(_req: Request, res: Response): Promise<void> {
    try {
      const { usersRow, payoutsRow, withdrawalsRow } = await serverDatabaseAdminData.getLandingStatsRows();
      const startMs = Date.parse(`${onlineStartDate}T00:00:00Z`);
      const nowMs = Date.now();
      const daysOnline = Math.max(1, Math.floor((nowMs - startMs) / (1000 * 60 * 60 * 24)) + 1);

      res.json({
        ok: true,
        registeredUsers: usersRow?.total || 0,
        totalPaid: Number(payoutsRow?.total || 0) + Number(withdrawalsRow?.total || 0),
        daysOnline
      });
    } catch {
      res.status(500).json({ ok: false, message: "Unable to load landing stats." });
    }
  }

  async function getRecentPayments(_req: Request, res: Response): Promise<void> {
    try {
      const payments = await serverDatabaseAdminData.listRecentPayments(10);
      res.json({
        ok: true,
        payments: payments.map((payment) => ({
          id: payment.id,
          username: payment.username,
          amountPol: Number(payment.amount_pol || 0),
          source: payment.source || "mining",
          txHash: payment.tx_hash || null,
          createdAt: Number(payment.created_at || 0)
        }))
      });
    } catch {
      res.status(500).json({ ok: false, message: "Unable to load recent payments." });
    }
  }

  async function getNetworkStats(_req: Request, res: Response): Promise<void> {
    try {
      const data = await serverDatabaseAdminData.getNetworkStatsRows();
      const [miningRoomNetworkHash, miniGameNetworkHash, youtubeNetworkHash] = await Promise.all([
        publicStateService.getActiveMiningRoomHashRateTotal(),
        publicStateService.getActiveMiniGameHashRateTotal(),
        publicStateService.getActiveYoutubeHashRateTotal()
      ]);
      const totalBoostHash = Number(miniGameNetworkHash || 0) + Number(youtubeNetworkHash || 0);
      const startMs = Date.parse(`${onlineStartDate}T00:00:00Z`);
      const nowMs = Date.now();
      const daysOnline = Math.max(1, Math.floor((nowMs - startMs) / (1000 * 60 * 60 * 24)) + 1);

      res.json({
        ok: true,
        registeredUsers: data.usersRow?.total || 0,
        totalPaid: Number(data.payoutsRow?.total || 0) + Number(data.withdrawalsRow?.total || 0),
        daysOnline,
        networkHashRate: Number(data.baseNetworkRow?.total || 0),
        miningRoomHashRate: Number(miningRoomNetworkHash || 0),
        activeGameHashRate: Number(miniGameNetworkHash || 0),
        activeYoutubeHashRate: Number(youtubeNetworkHash || 0),
        activeBoostHashRate: totalBoostHash
      });
    } catch {
      res.status(500).json({ ok: false, message: "Unable to load network stats." });
    }
  }

  async function getEstimatedReward(req: Request, res: Response): Promise<void> {
    try {
      if (req.user == null) {
        res.status(401).json({ ok: false, message: "Unauthorized." });
        return;
      }
      const userId = req.user.id;
      const rows = await serverDatabaseAdminData.getEstimatedRewardRows(userId);
      const [userMiniGameHash, userYoutubeHash, miniGameNetworkHash, youtubeNetworkHash] = await Promise.all([
        publicStateService.getUserMiniGameHashRate(userId),
        publicStateService.getUserYoutubeHashRate(userId),
        publicStateService.getActiveMiniGameHashRateTotal(),
        publicStateService.getActiveYoutubeHashRateTotal()
      ]);

      const userGameHash = Number(userMiniGameHash || 0) + Number(userYoutubeHash || 0);
      const gameNetworkHash = Number(miniGameNetworkHash || 0) + Number(youtubeNetworkHash || 0);
      const userHashRate = Number(rows.userBaseRow?.total || 0);
      const networkHashRate = Number(rows.baseNetworkRow?.total || 0);
      const share = networkHashRate > 0 ? userHashRate / networkHashRate : 0;
      const blockReward = Number(engine.rewardBase || 0);

      res.json({
        ok: true,
        userHashRate,
        networkHashRate,
        share,
        blockReward,
        estimatedReward: blockReward * share,
        tokenSymbol: engine.tokenSymbol,
        breakdown: {
          userMiniGameHashRate: Number(userMiniGameHash || 0),
          userYoutubeHashRate: Number(userYoutubeHash || 0),
          networkMiniGameHashRate: Number(miniGameNetworkHash || 0),
          networkYoutubeHashRate: Number(youtubeNetworkHash || 0)
        }
      });
    } catch {
      res.status(500).json({ ok: false, message: "Unable to load estimated reward." });
    }
  }

  async function getYoutubeStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = Number(req.user?.id || 0);
      const now = Date.now();
      const rows = await serverDatabaseAdminData.getYoutubeStatusRows(userId, now);

      const lastClaimedAt = Number(rows.latestClaim?.claimed_at || 0);
      const elapsedMs = lastClaimedAt > 0 ? now - lastClaimedAt : youtubeWatchClaimIntervalMs;
      const nextClaimInSeconds = elapsedMs >= youtubeWatchClaimIntervalMs
        ? 0
        : Math.ceil((youtubeWatchClaimIntervalMs - elapsedMs) / 1000);

      res.json({
        ok: true,
        rewardGh: youtubeRewardGh,
        rewardDurationSeconds: Math.round(youtubeWatchBoostDurationMs / 1000),
        nextClaimInSeconds,
        activeHashRate: Number(rows.activeRow?.total || 0)
      });
    } catch (error: unknown) {
      logger.error("YouTube status failed", {
        error: readErrorMessage(error),
        userId: req.user?.id ?? null
      });
      res.status(500).json({ ok: false, message: "Unable to load YouTube watch status." });
    }
  }

  async function getYoutubeStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = Number(req.user?.id || 0);
      const now = Date.now();
      const dayAgo = now - 24 * 60 * 60 * 1000;
      const rows = await serverDatabaseAdminData.getYoutubeUserStatsRows(userId, now, dayAgo);

      const lastClaimedAt = Number(rows.latestClaim?.claimed_at || 0);
      const elapsedMs = lastClaimedAt > 0 ? now - lastClaimedAt : youtubeWatchClaimIntervalMs;
      const nextClaimInSeconds = elapsedMs >= youtubeWatchClaimIntervalMs
        ? 0
        : Math.ceil((youtubeWatchClaimIntervalMs - elapsedMs) / 1000);

      res.json({
        ok: true,
        rewardGh: youtubeRewardGh,
        rewardDurationSeconds: Math.round(youtubeWatchBoostDurationMs / 1000),
        activeHashRate: Number(rows.activeRow?.total || 0),
        claimsTotal: Number(rows.totalsRow?.claims || 0),
        hashGrantedTotal: Number(rows.totalsRow?.hash_granted || 0),
        claims24h: Number(rows.dayRow?.claims_24h || 0),
        hashGranted24h: Number(rows.dayRow?.hash_granted_24h || 0),
        nextClaimInSeconds,
        lastClaimAt: lastClaimedAt || null
      });
    } catch (error: unknown) {
      logger.error("YouTube user stats failed", {
        error: readErrorMessage(error),
        userId: req.user?.id ?? null
      });
      res.status(500).json({ ok: false, message: "Unable to load YouTube stats." });
    }
  }

  async function claimYoutubeReward(req: Request, res: Response): Promise<void> {
    try {
      const userId = Number(req.user?.id || 0);
      const now = Date.now();
      const sourceVideoId = String(req.body?.videoId || "").trim() || null;

      const latestClaim = await serverDatabaseAdminData.getLatestYoutubeClaim(userId);
      const lastClaimedAt = Number(latestClaim?.claimed_at || 0);
      if (lastClaimedAt > 0) {
        const elapsedMs = now - lastClaimedAt;
        if (elapsedMs < youtubeWatchClaimIntervalMs) {
          const remainingSeconds = Math.ceil((youtubeWatchClaimIntervalMs - elapsedMs) / 1000);
          res.status(429).json({
            ok: false,
            message: `Wait ${remainingSeconds}s before claiming the next YouTube reward.`,
            nextClaimInSeconds: remainingSeconds
          });
          return;
        }
      }

      const expiresAt = now + youtubeWatchBoostDurationMs;
      await serverDatabaseAdminData.grantYoutubeReward({
        userId,
        rewardGh: youtubeRewardGh,
        now,
        expiresAt,
        sourceVideoId
      });
      await publicStateService.syncUserBaseHashRate(userId);
      const freshClaim = await serverDatabaseAdminData.getLatestYoutubeClaim(userId);
      const youtubeWatchHistoryId = Number(freshClaim?.id || 0);
      if (youtubeWatchHistoryId > 0) {
        await notifyMiniPassYoutubeWatch(userId, youtubeWatchHistoryId);
      }

      const activeRow = await serverDatabaseAdminData.getYoutubeStatusRows(userId, now);
      res.json({
        ok: true,
        rewardGh: youtubeRewardGh,
        rewardDurationSeconds: Math.round(youtubeWatchBoostDurationMs / 1000),
        activeHashRate: Number(activeRow.activeRow?.total || 0),
        expiresAt
      });
    } catch (error: unknown) {
      logger.error("YouTube claim failed", {
        error: readErrorMessage(error),
        userId: req.user?.id ?? null
      });
      res.status(500).json({ ok: false, message: "Unable to claim YouTube watch reward." });
    }
  }

  return {
    getAdminUserDetails,
    getAdminFinanceOverview,
    getAdminFinanceActivity,
    getAdminYoutubeStats,
    getAdminYoutubeHistory,
    listChatMessages,
    createChatMessage,
    getLandingStats,
    getRecentPayments,
    getNetworkStats,
    getEstimatedReward,
    getYoutubeStatus,
    getYoutubeStats,
    claimYoutubeReward
  };
}

export { createServerDatabaseController };
