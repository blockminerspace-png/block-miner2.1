import { v4 as uuidv4 } from "uuid";
import type { Server } from "socket.io";
import loggerLib from "../utils/logger.js";
import { sanitizePublicStateForSocket } from "../utils/socketStateSanitize.js";
import { errMsg } from "../types/tsNarrowing.js";
import prisma from "./db/prisma.js";

const logger = loggerLib.child("MiningEngine");

const DEFAULT_BLOCK_REWARD_POL = 0.3;
const DEFAULT_BLOCK_REWARD_SHIB = 69.44;
const DEFAULT_BLOCK_DURATION_MS = 10 * 60 * 1000;
/** Bps full POL allocation (100% POL → 0% SHIB). */
export const ALLOCATION_BPS_MAX = 10000;

/** POL minted per POL-pool block (shared by miners). Env overrides hardcoded default. */
function readMiningBlockRewardPol() {
  const keys = ["MINING_POL_BLOCK_REWARD", "BLOCK_REWARD_POL", "BLOCKMINER_POL_BLOCK_REWARD"];
  for (const k of keys) {
    const raw = process.env[k];
    if (raw == null || String(raw).trim() === "") continue;
    const n = Number(String(raw).trim());
    if (Number.isFinite(n) && n > 0 && n <= 1_000_000) return n;
  }
  return DEFAULT_BLOCK_REWARD_POL;
}

/** SHIB minted per SHIB-pool block. Same per-block cadence as POL; pool split per-miner via allocation bps. */
function readMiningBlockRewardShib() {
  const keys = ["MINING_SHIB_BLOCK_REWARD", "BLOCK_REWARD_SHIB", "BLOCKMINER_SHIB_BLOCK_REWARD"];
  for (const k of keys) {
    const raw = process.env[k];
    if (raw == null || String(raw).trim() === "") continue;
    const n = Number(String(raw).trim());
    if (Number.isFinite(n) && n > 0 && n <= 1_000_000_000) return n;
  }
  return DEFAULT_BLOCK_REWARD_SHIB;
}

/** Clamp allocation bps to [0, ALLOCATION_BPS_MAX] and round to nearest 500 (5% step). */
export function normalizeAllocationBps(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return ALLOCATION_BPS_MAX;
  const clamped = Math.max(0, Math.min(ALLOCATION_BPS_MAX, Math.round(n)));
  return Math.round(clamped / 500) * 500;
}

/** Interval between block settlements. Prefer minutes env; optional MS for fine control. */
function readMiningBlockDurationMs() {
  const msRaw = process.env.MINING_BLOCK_INTERVAL_MS;
  if (msRaw != null && String(msRaw).trim() !== "") {
    const ms = Number(String(msRaw).trim());
    if (Number.isFinite(ms) && ms >= 60_000 && ms <= 86400000) return Math.round(ms);
  }
  const minKeys = ["MINING_BLOCK_INTERVAL_MINUTES", "BLOCK_INTERVAL_MINUTES", "BLOCKMINER_BLOCK_INTERVAL_MINUTES"];
  for (const k of minKeys) {
    const raw = process.env[k];
    if (raw == null || String(raw).trim() === "") continue;
    const m = Number(String(raw).trim());
    if (Number.isFinite(m) && m >= 1 && m <= 1440) return Math.round(m * 60 * 1000);
  }
  return DEFAULT_BLOCK_DURATION_MS;
}

/** In-memory miner record (engine runtime). */
export type EngineMiner = {
  id: string;
  userId: number;
  walletAddress: string | null;
  username: string;
  rigs: number;
  baseHashRate: number;
  active: boolean;
  boostMultiplier: number;
  boostEndsAt: number;
  balance: number;
  lastPersistedBalance: number;
  lifetimeMined: number;
  connected: boolean;
  refCode: string | null;
  referralCount: number;
  miningPayoutMode: string;
  /** Basis points of hashrate dedicated to POL pool; remainder feeds SHIB pool. */
  miningAllocationPolBps: number;
  /** Cumulative SHIB minted into the user account by this engine session (informational; persisted balance is in DB). */
  lifetimeMinedShib: number;
  /** SHIB delta produced by the last settled block — surfaced in state payloads. */
  lastShibReward: number;
  /** Cached SHIB balance (mirrors DB `shibBalance`; updated on miner:join and on every block settle). */
  shibBalance: number;
};

export type BlockHistoryEntry = {
  blockNumber: number;
  reward: number;
  rewardShib: number;
  minerCount: number;
  timestamp: number;
  userRewards: Record<number, number>;
  userRewardsShib: Record<number, number>;
  persistFailed?: boolean;
};

export type MinerRewardRow = {
  minerId: string;
  userId: number;
  username: string;
  walletAddress: string | null;
  rigs: number;
  baseHashRate: number;
  workAccumulated: number;
  sharePercentage: number;
  rewardAmount: number;
  balanceAfter: number;
  lifetimeMined: number;
  /** Effective work credited toward POL pool (raw work × polFactor). */
  workPol: number;
  /** Effective work credited toward SHIB pool (raw work × shibFactor). */
  workShib: number;
  /** Share of the SHIB pool's totalWorkShib that this miner contributed (0..100). */
  shareShibPercentage: number;
  /** Allocation snapshot at settle time (basis points). */
  allocationPolBps: number;
  /** SHIB minted to this miner for this block. */
  rewardAmountShib: number;
};

export type PersistBlockRewardsPayload = {
  blockNumber: number;
  blockReward: number;
  blockRewardShib: number;
  totalWork: number;
  totalWorkPol: number;
  totalWorkShib: number;
  minerRewards: MinerRewardRow[];
  now: number;
};

export class MiningEngine {
  tokenSymbol!: string;
  blockNumber!: number;
  rewardBase!: number;
  /** SHIB minted per block (shared by all hashrate allocated to SHIB pool). */
  rewardBaseShib!: number;
  blockTarget!: number;
  blockProgress!: number;
  blockDurationMs!: number;
  blockStartedAt!: number;
  nextBlockAt!: number;
  tokenPrice!: number;
  totalMinted!: number;
  lastReward!: number;
  roundWork!: Map<string, number>;
  miners!: Map<string, EngineMiner>;
  minersByUserId!: Map<number, EngineMiner>;
  lastBlockAt!: number;
  activeMiners!: number;
  currentNetworkHashRate!: number;
  blockHistory!: BlockHistoryEntry[];
  leaderboardCache!: unknown[];
  leaderboardCacheDirty!: boolean;
  logRewardCallback!: ((payload: Record<string, unknown>) => void) | null;
  persistBlockRewardsCallback!: ((payload: PersistBlockRewardsPayload) => Promise<void>) | null;
  _settlementFreezingRoundWork!: boolean;
  io!: Server | null;
  profileLoader!: ((userId: number) => Promise<Record<string, unknown> | null>) | null;

  constructor() {
    this.tokenSymbol = "POL";
    this.blockNumber = 1;
    this.rewardBase = readMiningBlockRewardPol();
    this.rewardBaseShib = readMiningBlockRewardShib();
    this.blockTarget = 100;
    this.blockProgress = 0;
    this.blockDurationMs = readMiningBlockDurationMs();
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
    this.io = null;
    this.profileLoader = null;

    if (process.env.NODE_ENV === "production") {
      logger.info("Mining block economy", {
        rewardBasePol: this.rewardBase,
        rewardBaseShib: this.rewardBaseShib,
        blockIntervalMinutes: this.blockDurationMs / 60000
      });
    }
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

  async reloadMinerProfile(userId: number, { forceBalanceSync = false }: { forceBalanceSync?: boolean } = {}) {
    if (this.profileLoader) {
      const profile = await this.profileLoader(userId);
      if (profile) {
        const p = profile;
        const miner = this.findMinerByUserId(userId);
        if (miner) {
          miner.rigs = Number(p.rigs || 1);
          miner.baseHashRate = Number(p.base_hash_rate || 0);
          miner.refCode = (p.refCode as string | null | undefined) ?? null;
          miner.referralCount = Number(p.referralCount || 0);
          miner.miningPayoutMode =
            p.mining_payout_mode === "blk" || p.miningPayoutMode === "blk" ? "blk" : "pol";
          const rawAlloc =
            (p as { mining_allocation_pol_bps?: unknown; miningAllocationPolBps?: unknown })
              .mining_allocation_pol_bps ??
            (p as { miningAllocationPolBps?: unknown }).miningAllocationPolBps;
          if (rawAlloc != null) miner.miningAllocationPolBps = normalizeAllocationBps(rawAlloc);
          const rawShib =
            (p as { shib_balance?: unknown; shibBalance?: unknown }).shib_balance ??
            (p as { shibBalance?: unknown }).shibBalance;
          if (rawShib != null) miner.shibBalance = Number(rawShib) || 0;
          // Sincroniza saldo:
          // - modo normal: só sobe para não perder rewards ainda não persistidos
          // - modo forçado: espelha o banco após mutações explícitas de saldo
          const dbBalance = Number(p.balance || 0);
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

  findMinerByUserId(userId: number): EngineMiner | null {
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
        const rawAlloc = profile.mining_allocation_pol_bps ?? profile.miningAllocationPolBps;
        if (rawAlloc != null) existing.miningAllocationPolBps = normalizeAllocationBps(rawAlloc);
        const rawShib = profile.shib_balance ?? profile.shibBalance;
        if (rawShib != null) existing.shibBalance = Number(rawShib) || 0;
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
    const miner: EngineMiner = {
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
        profile?.mining_payout_mode === "blk" || profile?.miningPayoutMode === "blk" ? "blk" : "pol",
      miningAllocationPolBps: normalizeAllocationBps(
        profile?.mining_allocation_pol_bps ?? profile?.miningAllocationPolBps ?? ALLOCATION_BPS_MAX
      ),
      lifetimeMinedShib: 0,
      lastShibReward: 0,
      shibBalance: Number(profile?.shib_balance ?? profile?.shibBalance ?? 0)
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

  /**
   * Live-set the miner's POL/SHIB hashrate allocation. Takes effect on the NEXT settled block —
   * accumulated work for the current round still uses whatever split each miner had when ticks ran.
   * Caller is responsible for persisting to the DB; this just mutates the in-memory engine.
   */
  setMinerAllocation(minerId: string, rawBps: unknown) {
    const miner = this.miners.get(minerId);
    if (!miner) return { ok: false, message: "Miner não encontrado." } as const;
    const normalized = normalizeAllocationBps(rawBps);
    miner.miningAllocationPolBps = normalized;
    this.markLeaderboardDirty();
    return { ok: true, polBps: normalized, shibBps: ALLOCATION_BPS_MAX - normalized } as const;
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
   * Settles the current block (dual-pool: POL + SHIB on the same cadence). Each miner's raw
   * accumulated `work` is split by their `miningAllocationPolBps` snapshot at settle time:
   *   workPol = work * (bps / ALLOCATION_BPS_MAX)
   *   workShib = work - workPol
   * Then `totalWorkPol` and `totalWorkShib` are computed independently, and each pool's reward
   * is shared in proportion to that pool's contributing work. Persists before advancing
   * blockNumber/clearing roundWork; freezes accumulation while awaiting Postgres.
   */
  async distributeRewardsAsync() {
    this._settlementFreezingRoundWork = true;
    try {
      const minedBlockNumber = this.blockNumber;
      const roundSnapshot = new Map(this.roundWork);
      const totalWork = [...roundSnapshot.values()].reduce((sum, value) => sum + value, 0);

      const blockReward = this.rewardBase;
      const blockRewardShib = this.rewardBaseShib;

      // Snapshot per-miner work split now — allocation changes mid-block don't retroactively shift this round.
      type Split = { work: number; workPol: number; workShib: number; allocBps: number };
      const splitByMiner = new Map<string, Split>();
      let totalWorkPol = 0;
      let totalWorkShib = 0;
      for (const [minerId, work] of roundSnapshot.entries()) {
        const miner = this.miners.get(minerId);
        if (!miner || work <= 0) continue;
        const allocBps = normalizeAllocationBps(miner.miningAllocationPolBps);
        const polFactor = allocBps / ALLOCATION_BPS_MAX;
        const workPol = work * polFactor;
        const workShib = work - workPol;
        splitByMiner.set(minerId, { work, workPol, workShib, allocBps });
        totalWorkPol += workPol;
        totalWorkShib += workShib;
      }

      if (totalWork <= 0) {
        if (this.activeMiners > 0 || this.currentNetworkHashRate > 0) {
          logger.warn("Block closed with zero accumulated work while miners report hashrate", {
            blockNumber: minedBlockNumber,
            activeMiners: this.activeMiners,
            networkHashRate: this.currentNetworkHashRate
          });
        }
        this.roundWork.forEach((_, minerId) => this.roundWork.set(minerId, 0));
        this.lastReward = 0;
        this.blockHistory.unshift({
          blockNumber: minedBlockNumber,
          reward: 0,
          rewardShib: 0,
          minerCount: this.activeMiners,
          timestamp: Date.now(),
          userRewards: {},
          userRewardsShib: {}
        });
        if (this.blockHistory.length > 12) this.blockHistory.length = 12;
        this.finalizeBlockDistribution(minedBlockNumber, 0);
        return;
      }

      const minerRewards: MinerRewardRow[] = [];
      const userRewardsMap: Record<number, number> = {};
      const userRewardsShibMap: Record<number, number> = {};
      const balanceSnapshot = new Map<
        string,
        {
          balance: number;
          lifetimeMined: number;
          lastPersistedBalance: number;
          lifetimeMinedShib: number;
          lastShibReward: number;
          shibBalance: number;
        }
      >();

      for (const [minerId, split] of splitByMiner.entries()) {
        const miner = this.miners.get(minerId);
        if (!miner) continue;

        balanceSnapshot.set(minerId, {
          balance: miner.balance,
          lifetimeMined: miner.lifetimeMined,
          lastPersistedBalance: miner.lastPersistedBalance,
          lifetimeMinedShib: miner.lifetimeMinedShib ?? 0,
          lastShibReward: miner.lastShibReward ?? 0,
          shibBalance: miner.shibBalance ?? 0
        });

        const share = split.work / totalWork;
        const sharePol = totalWorkPol > 0 ? split.workPol / totalWorkPol : 0;
        const shareShib = totalWorkShib > 0 ? split.workShib / totalWorkShib : 0;

        const rewardPol = blockReward * sharePol;
        const rewardShib = blockRewardShib * shareShib;

        // POL is the in-engine live balance — keep current behavior.
        miner.balance += rewardPol;
        miner.lastPersistedBalance = (miner.lastPersistedBalance ?? miner.balance - rewardPol) + rewardPol;
        miner.lifetimeMined += rewardPol;
        this.totalMinted += rewardPol;
        // SHIB lifetime is engine-session-scoped (informational); the authoritative balance is `User.shibBalance`.
        miner.lifetimeMinedShib = (miner.lifetimeMinedShib ?? 0) + rewardShib;
        miner.lastShibReward = rewardShib;
        // Optimistically update the cached SHIB balance; persistBlockRewards will increment the DB row to match.
        miner.shibBalance = (miner.shibBalance ?? 0) + rewardShib;

        userRewardsMap[miner.userId] = rewardPol;
        userRewardsShibMap[miner.userId] = rewardShib;

        minerRewards.push({
          minerId: miner.id,
          userId: miner.userId,
          username: miner.username,
          walletAddress: miner.walletAddress,
          rigs: miner.rigs,
          baseHashRate: miner.baseHashRate,
          workAccumulated: split.work,
          sharePercentage: share * 100,
          rewardAmount: rewardPol,
          balanceAfter: miner.balance,
          lifetimeMined: miner.lifetimeMined,
          workPol: split.workPol,
          workShib: split.workShib,
          shareShibPercentage: shareShib * 100,
          allocationPolBps: split.allocBps,
          rewardAmountShib: rewardShib
        });
      }

      const now = Date.now();
      if (minerRewards.length > 0 && this.persistBlockRewardsCallback) {
        const persistMaxAttempts = Math.min(
          12,
          Math.max(1, Math.floor(Number(process.env.MINING_BLOCK_PERSIST_MAX_ATTEMPTS || 5)))
        );
        const retryBaseMs = Math.min(
          8000,
          Math.max(80, Math.floor(Number(process.env.MINING_BLOCK_PERSIST_RETRY_BASE_MS || 220)))
        );
        let persistError: unknown | null = null;
        for (let attempt = 1; attempt <= persistMaxAttempts; attempt += 1) {
          try {
            await this.persistBlockRewardsCallback({
              blockNumber: minedBlockNumber,
              blockReward,
              blockRewardShib,
              totalWork,
              totalWorkPol,
              totalWorkShib,
              minerRewards,
              now
            });
            persistError = null;
            break;
          } catch (error: unknown) {
            persistError = error;
            logger.warn("Block reward persistence attempt failed", {
              attempt,
              maxAttempts: persistMaxAttempts,
              blockNumber: minedBlockNumber,
              error: errMsg(error)
            });
            if (attempt < persistMaxAttempts) {
              const delay = Math.min(15_000, Math.round(retryBaseMs * attempt ** 1.35));
              await new Promise((r) => setTimeout(r, delay));
            }
          }
        }
        if (persistError) {
          logger.error("Block reward persistence failed — rolling back in-memory rewards", {
            error: errMsg(persistError),
            blockNumber: minedBlockNumber
          });
          for (const [minerId, snapshot] of balanceSnapshot.entries()) {
            const miner = this.miners.get(minerId);
            if (miner) {
              const rewardEntry = minerRewards.find((r) => r.minerId === minerId);
              if (rewardEntry) {
                miner.balance = snapshot.balance;
                miner.lifetimeMined = snapshot.lifetimeMined;
                miner.lastPersistedBalance = snapshot.lastPersistedBalance;
                miner.lifetimeMinedShib = snapshot.lifetimeMinedShib;
                miner.lastShibReward = snapshot.lastShibReward;
                miner.shibBalance = snapshot.shibBalance;
                this.totalMinted -= rewardEntry.rewardAmount;
              }
            }
          }
          // Drop this round's work and advance the schedule; rewards for this block were not committed.
          for (const [minerId, work] of roundSnapshot.entries()) {
            if (work > 0 && this.miners.get(minerId)) {
              this.roundWork.set(minerId, 0);
            }
          }
          this.blockHistory.unshift({
            blockNumber: minedBlockNumber,
            reward: blockReward,
            rewardShib: blockRewardShib,
            minerCount: this.activeMiners,
            timestamp: Date.now(),
            userRewards: {},
            userRewardsShib: {},
            persistFailed: true
          });
          if (this.blockHistory.length > 12) this.blockHistory.length = 12;
          this.lastReward = 0;
          this.markLeaderboardDirty();
          this.finalizeBlockDistribution(minedBlockNumber, 0);
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
        rewardShib: blockRewardShib,
        minerCount: this.activeMiners,
        timestamp: Date.now(),
        userRewards: userRewardsMap,
        userRewardsShib: userRewardsShibMap
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

    if (Date.now() >= this.nextBlockAt) {
      await this.distributeRewardsAsync();
    }

    const elapsed = Math.max(0, Date.now() - this.blockStartedAt);
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

  getPublicState(minerId?: unknown, options: { includeLeaderboard?: boolean } = {}) {
    const includeLeaderboard = Boolean(options.includeLeaderboard);
    const key = minerId == null || minerId === "" ? null : String(minerId);
    const miner = key ? this.miners.get(key) : null;
    const userId = miner?.userId;
    const remainingMs = Math.max(0, this.nextBlockAt - Date.now());
    
    // Customize block history for this user
    const customizedHistory = this.blockHistory.map((b: BlockHistoryEntry) => ({
      blockNumber: b.blockNumber,
      totalReward: b.reward,
      totalRewardShib: b.rewardShib ?? 0,
      userReward: userId ? (b.userRewards?.[userId] || 0) : 0,
      userRewardShib: userId ? (b.userRewardsShib?.[userId] || 0) : 0,
      minerCount: b.minerCount,
      timestamp: b.timestamp,
      persistFailed: Boolean(b.persistFailed)
    }));

    return {
      serverTime: Date.now(),
      tokenSymbol: this.tokenSymbol,
      tokenPrice: this.tokenPrice,
      blockReward: this.rewardBase,
      blockRewardShib: this.rewardBaseShib,
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
        referralCount: miner.referralCount || 0,
        miningAllocationPolBps: normalizeAllocationBps(miner.miningAllocationPolBps),
        lastShibReward: miner.lastShibReward ?? 0,
        lifetimeMinedShib: miner.lifetimeMinedShib ?? 0,
        shibBalance: miner.shibBalance ?? 0
      } : null
    };
  }
}
