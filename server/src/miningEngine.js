import { v4 as uuidv4 } from "uuid";
import loggerLib from "../utils/logger.js";
import { sanitizePublicStateForSocket } from "../utils/socketStateSanitize.js";

const logger = loggerLib.child("MiningEngine");

export class MiningEngine {
  constructor() {
    this.tokenSymbol = "POL";
    this.blockNumber = 1;
    this.rewardBase = 0.30;
    this.blockTarget = 100;
    this.blockProgress = 0;
    this.blockDurationMs = 10 * 60 * 1000;
    this.blockStartedAt = Date.now();
    this.nextBlockAt = this.blockStartedAt + this.blockDurationMs;
    this.tokenPrice = 0.35;
    this.totalMinted = 0;
    this.lastReward = 0;
    this.roundWork = new Map();
    this.miners = new Map();
    this.minersByUserId = new Map();
    this.lastBlockAt = Date.now();
    this.activeMiners = 0;
    this.currentNetworkHashRate = 0;
    this.blockHistory = [];
    this.leaderboardCache = [];
    this.leaderboardCacheDirty = true;
    this.logRewardCallback = null;
    this.persistBlockRewardsCallback = null;
    /** While true, tick does not add hashrate into roundWork (avoids mixing windows during async DB settle). */
    this._settlementFreezingRoundWork = false;
  }

  setRewardLogger(callback) {
    this.logRewardCallback = callback;
  }

  setPersistBlockRewardsCallback(callback) {
    this.persistBlockRewardsCallback = callback;
  }

  setIo(io) {
    this.io = io;
  }

  setProfileLoader(loader) {
    this.profileLoader = loader;
  }

  markLeaderboardDirty() {
    this.leaderboardCacheDirty = true;
  }

  async reloadMinerProfile(userId, { forceBalanceSync = false } = {}) {
    if (this.profileLoader) {
      const profile = await this.profileLoader(userId);
      if (profile) {
        const miner = this.findMinerByUserId(userId);
        if (miner) {
          miner.rigs = Number(profile.rigs || 1);
          miner.baseHashRate = Number(profile.base_hash_rate || 0);
          miner.refCode = profile.refCode;
          miner.referralCount = profile.referralCount;
          miner.miningPayoutMode =
            profile.mining_payout_mode === "blk" || profile.miningPayoutMode === "blk" ? "blk" : "pol";
          // Sincroniza saldo:
          // - modo normal: só sobe para não perder rewards ainda não persistidos
          // - modo forçado: espelha o banco após mutações explícitas de saldo
          const dbBalance = Number(profile.balance || 0);
          if (forceBalanceSync || dbBalance > miner.balance) {
            miner.balance = dbBalance;
            miner.lastPersistedBalance = dbBalance;
          }
          this.markLeaderboardDirty();
          // Emit updated miner state so referralCount updates in real-time for online referrers
          if (this.io) {
            const state = this.getPublicState(miner.id);
            const safe = sanitizePublicStateForSocket(state);
            if (safe) this.io.to(`user:${userId}`).emit("state:update", safe);
          }
        }
      }
    }
    if (this.io) {
      this.io.to(`user:${userId}`).emit("machines:update", null);
      this.io.to(`user:${userId}`).emit("inventory:update", null);
    }
  }

  findMinerByUserId(userId) {
    if (!userId) return null;
    return this.minersByUserId.get(userId) ?? null;
  }

  createOrGetMiner({ userId, username, walletAddress, profile }) {
    const existing = this.findMinerByUserId(userId);
    if (existing) {
      if (username) existing.username = username;
      if (walletAddress) existing.walletAddress = walletAddress;
      if (profile) {
        existing.rigs = Number(profile.rigs || 1);
        existing.baseHashRate = Number(profile.base_hash_rate || profile.baseHashRate || 0);
        existing.refCode = profile.refCode;
        existing.referralCount = profile.referralCount;
        existing.miningPayoutMode =
          profile.mining_payout_mode === "blk" || profile.miningPayoutMode === "blk" ? "blk" : "pol";
        // Sincroniza saldo com o banco ao reconectar (pega o maior valor para nao perder rewards nao persistidos)
        const dbBalance = Number(profile.balance || 0);
        if (dbBalance > existing.balance) {
          existing.balance = dbBalance;
          existing.lastPersistedBalance = dbBalance;
        }
      }
      this.markLeaderboardDirty();
      return existing;
    }

    const id = uuidv4();
    const miner = {
      id,
      userId,
      walletAddress: walletAddress || null,
      username: username || `Miner-${id.slice(0, 5)}`,
      rigs: Number(profile?.rigs || 1),
      baseHashRate: Number(profile?.base_hash_rate || profile?.baseHashRate || 0),
      active: true,
      boostMultiplier: 1,
      boostEndsAt: 0,
      balance: Number(profile?.balance || 0),
      lastPersistedBalance: Number(profile?.balance || 0),
      lifetimeMined: Number(profile?.lifetimeMined || 0),
      connected: true,
      refCode: profile?.refCode || null,
      referralCount: profile?.referralCount || 0,
      miningPayoutMode:
        profile?.mining_payout_mode === "blk" || profile?.miningPayoutMode === "blk" ? "blk" : "pol"
    };

    this.miners.set(id, miner);
    this.minersByUserId.set(userId, miner);
    this.roundWork.set(id, 0);
    this.markLeaderboardDirty();
    return miner;
  }

  setConnected(minerId, connected) {
    const miner = this.miners.get(minerId);
    if (!miner) return;
    miner.connected = connected;
  }

  setActive(minerId, active) {
    const miner = this.miners.get(minerId);
    if (!miner) return null;
    miner.active = !!active;
    this.markLeaderboardDirty();
    return miner;
  }

  setWallet(minerId, walletAddress) {
    const miner = this.miners.get(minerId);
    if (!miner) return null;
    miner.walletAddress = walletAddress || null;
    return miner;
  }

  applyBoost(minerId) {
    const miner = this.miners.get(minerId);
    if (!miner) return { ok: false, message: "Miner não encontrado." };

    const boostCost = 0.35;
    if (miner.balance < boostCost) {
      return { ok: false, message: "Saldo insuficiente para boost." };
    }

    miner.balance -= boostCost;
    miner.boostMultiplier = 1.25;
    miner.boostEndsAt = Date.now() + 30000;
    this.markLeaderboardDirty();

    return { ok: true, message: "Boost ativado por 30s." };
  }

  upgradeRig(minerId) {
    const miner = this.miners.get(minerId);
    if (!miner) return { ok: false, message: "Miner não encontrado." };

    const rigCost = 2 + (miner.rigs - 1) * 0.8;
    if (miner.balance < rigCost) {
      return { ok: false, message: `Você precisa de ${rigCost.toFixed(2)} ${this.tokenSymbol}.` };
    }

    miner.balance -= rigCost;
    miner.rigs += 1;
    miner.baseHashRate += 18;
    this.markLeaderboardDirty();

    return { ok: true, message: `Rig #${miner.rigs} comprado com sucesso.` };
  }

  getMinerHashRate(miner) {
    if (!miner.active) return 0;
    return miner.baseHashRate * miner.boostMultiplier;
  }

  /**
   * Settles the current POL block: persists rewards before advancing blockNumber / clearing roundWork.
   * Freezes roundWork accumulation while awaiting Postgres so work is not lost on persist failure.
   */
  async distributeRewardsAsync() {
    this._settlementFreezingRoundWork = true;
    try {
      const minedBlockNumber = this.blockNumber;
      const roundSnapshot = new Map(this.roundWork);
      const totalWork = [...roundSnapshot.values()].reduce((sum, value) => sum + value, 0);

      if (totalWork <= 0) {
        this.roundWork.forEach((_, minerId) => this.roundWork.set(minerId, 0));
        this.lastReward = 0;
        this.blockHistory.unshift({
          blockNumber: minedBlockNumber,
          reward: 0,
          minerCount: this.activeMiners,
          timestamp: Date.now(),
          userRewards: {}
        });
        if (this.blockHistory.length > 12) this.blockHistory.length = 12;
        this.finalizeBlockDistribution(minedBlockNumber, 0);
        return;
      }

      const blockReward = this.rewardBase;
      const minerRewards = [];
      const userRewardsMap = {};
      const balanceSnapshot = new Map();

      for (const [minerId, work] of roundSnapshot.entries()) {
        const miner = this.miners.get(minerId);
        if (!miner || work <= 0) {
          this.roundWork.set(minerId, 0);
          continue;
        }

        balanceSnapshot.set(minerId, {
          balance: miner.balance,
          lifetimeMined: miner.lifetimeMined,
          lastPersistedBalance: miner.lastPersistedBalance
        });

        const share = work / totalWork;
        const reward = blockReward * share;
        miner.balance += reward;
        miner.lastPersistedBalance = (miner.lastPersistedBalance ?? miner.balance - reward) + reward;
        miner.lifetimeMined += reward;
        this.totalMinted += reward;

        userRewardsMap[miner.userId] = reward;

        minerRewards.push({
          minerId: miner.id,
          userId: miner.userId,
          username: miner.username,
          walletAddress: miner.walletAddress,
          rigs: miner.rigs,
          baseHashRate: miner.baseHashRate,
          workAccumulated: work,
          sharePercentage: share * 100,
          rewardAmount: reward,
          balanceAfter: miner.balance,
          lifetimeMined: miner.lifetimeMined
        });
      }

      const now = Date.now();
      if (minerRewards.length > 0 && this.persistBlockRewardsCallback) {
        try {
          await this.persistBlockRewardsCallback({
            blockNumber: minedBlockNumber,
            blockReward,
            totalWork,
            minerRewards,
            now
          });
        } catch (error) {
          logger.error("Block reward persistence failed — rolling back", { error: error.message });
          for (const [minerId, snapshot] of balanceSnapshot.entries()) {
            const miner = this.miners.get(minerId);
            if (miner) {
              const rewardEntry = minerRewards.find((r) => r.minerId === minerId);
              if (rewardEntry) {
                miner.balance = snapshot.balance;
                miner.lifetimeMined = snapshot.lifetimeMined;
                miner.lastPersistedBalance = snapshot.lastPersistedBalance;
                this.totalMinted -= rewardEntry.rewardAmount;
              }
            }
          }
          for (const [minerId, work] of roundSnapshot.entries()) {
            this.roundWork.set(minerId, work);
          }
          return;
        }
      }

      for (const [minerId, work] of roundSnapshot.entries()) {
        if (work > 0 && this.miners.get(minerId)) {
          this.roundWork.set(minerId, 0);
        }
      }

      this.blockHistory.unshift({
        blockNumber: minedBlockNumber,
        reward: blockReward,
        minerCount: this.activeMiners,
        timestamp: Date.now(),
        userRewards: userRewardsMap
      });
      if (this.blockHistory.length > 12) this.blockHistory.length = 12;

      this.lastReward = blockReward;
      this.markLeaderboardDirty();
      this.finalizeBlockDistribution(minedBlockNumber, blockReward);
    } finally {
      this._settlementFreezingRoundWork = false;
    }
  }

  finalizeBlockDistribution(num, reward) {
    this.blockNumber += 1;
    this.blockProgress = 0;
    this.lastBlockAt = Date.now();
    this.blockStartedAt = this.lastBlockAt;
    this.nextBlockAt = this.blockStartedAt + this.blockDurationMs;
  }

  async tickAsync() {
    const now = Date.now();
    let totalHashRate = 0;
    let activeMiners = 0;
    let leaderboardChanged = false;

    for (const [minerId, miner] of this.miners.entries()) {
      if (miner.boostEndsAt > 0 && now >= miner.boostEndsAt) {
        miner.boostMultiplier = 1;
        miner.boostEndsAt = 0;
        leaderboardChanged = true;
      }
      const hashRate = this.getMinerHashRate(miner);
      totalHashRate += hashRate;
      if (hashRate > 0) activeMiners += 1;
      // Recompensa por bloco é só POL hoje; modo BLK no perfil ainda não desvia mint por bloco.
      // Todos acumulam work no pool POL para o bloco não ficar "morto" quando alguém escolheu BLK na UI.
      if (!this._settlementFreezingRoundWork) {
        this.roundWork.set(minerId, (this.roundWork.get(minerId) || 0) + hashRate);
      }
    }

    if (leaderboardChanged) {
      this.markLeaderboardDirty();
    }

    this.currentNetworkHashRate = totalHashRate;
    this.activeMiners = activeMiners;

    if (now >= this.nextBlockAt) {
      await this.distributeRewardsAsync();
    }

    const elapsed = Math.max(0, now - this.blockStartedAt);
    this.blockProgress = Math.min(this.blockTarget, (elapsed / this.blockDurationMs) * this.blockTarget);
  }

  getLeaderboard(limit = 10) {
    if (this.leaderboardCacheDirty) {
      this.leaderboardCache = [...this.miners.values()]
        .map((m) => ({
          id: m.id,
          username: m.username,
          rigs: m.rigs,
          active: m.active,
          lifetimeMined: m.lifetimeMined,
          currentHashRate: this.getMinerHashRate(m)
        }))
        .sort((a, b) => b.lifetimeMined - a.lifetimeMined);
      this.leaderboardCacheDirty = false;
    }
    return this.leaderboardCache.slice(0, limit);
  }

  getPublicState(minerId, options = {}) {
    const includeLeaderboard = Boolean(options.includeLeaderboard);
    const miner = minerId ? this.miners.get(minerId) : null;
    const userId = miner?.userId;
    const remainingMs = Math.max(0, this.nextBlockAt - Date.now());
    
    // Customize block history for this user
    const customizedHistory = this.blockHistory.map(b => ({
      blockNumber: b.blockNumber,
      totalReward: b.reward,
      userReward: userId ? (b.userRewards?.[userId] || 0) : 0,
      minerCount: b.minerCount,
      timestamp: b.timestamp
    }));

    return {
      serverTime: Date.now(),
      tokenSymbol: this.tokenSymbol,
      tokenPrice: this.tokenPrice,
      blockReward: this.rewardBase,
      /** Minutes between POL block settlements (for calculator / UI). */
      blockIntervalMinutes: this.blockDurationMs / 60000,
      blockNumber: this.blockNumber,
      blockProgress: this.blockProgress,
      blockCountdownSeconds: Math.ceil(remainingMs / 1000),
      totalMiners: this.miners.size,
      activeMiners: this.activeMiners,
      networkHashRate: this.currentNetworkHashRate,
      totalMinted: this.totalMinted,
      lastReward: this.lastReward,
      blockHistory: customizedHistory,
      ...(includeLeaderboard ? { leaderboard: this.getLeaderboard() } : {}),
      miner: miner ? {
        id: miner.id,
        username: miner.username,
        walletAddress: miner.walletAddress,
        rigs: miner.rigs,
        active: miner.active,
        balance: miner.balance,
        lifetimeMined: miner.lifetimeMined,
        connected: miner.connected,
        estimatedHashRate: this.getMinerHashRate(miner),
        refCode: miner.refCode || null,
        referralCount: miner.referralCount || 0
      } : null
    };
  }
}
