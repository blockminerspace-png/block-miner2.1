const MAX_BLOCK_HISTORY = 48;
const MAX_USERNAME_LEN = 64;
const MAX_WALLET_LEN = 128;
const MAX_REF_LEN = 32;
const NUM_SAFE = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function sanitizeUsername(raw) {
  return String(raw ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, MAX_USERNAME_LEN);
}

function sanitizeWallet(raw) {
  return String(raw ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .slice(0, MAX_WALLET_LEN);
}

function sanitizeRefCode(raw) {
  return String(raw ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, MAX_REF_LEN);
}

function sanitizeBlockHistory(arr) {
  if (!Array.isArray(arr)) return [];
    return arr.slice(0, MAX_BLOCK_HISTORY).map((b) => {
      if (!b || typeof b !== "object") {
        return { blockNumber: 0, totalReward: 0, userReward: 0, minerCount: 0, timestamp: Date.now() };
      }
      const ts = b.timestamp != null ? (typeof b.timestamp === "number" ? b.timestamp : Date.parse(String(b.timestamp))) : Date.now();
      return {
        blockNumber: Math.trunc(NUM_SAFE(b.blockNumber, 0)),
        totalReward: NUM_SAFE(b.totalReward ?? b.reward, 0),
        userReward: NUM_SAFE(b.userReward, 0),
        minerCount: Math.trunc(NUM_SAFE(b.minerCount, 0)),
        timestamp: Number.isFinite(ts) ? ts : Date.now(),
        persistFailed: Boolean(b.persistFailed)
      };
    });
}

function sanitizeMiner(m) {
  if (!m || typeof m !== "object") return null;
  return {
    id: typeof m.id === "string" ? m.id.slice(0, 48) : m.id != null ? String(m.id).slice(0, 48) : undefined,
    username: sanitizeUsername(m.username),
    walletAddress: m.walletAddress == null ? null : sanitizeWallet(m.walletAddress),
    rigs: Math.max(0, Math.trunc(NUM_SAFE(m.rigs, 0))),
    active: Boolean(m.active),
    balance: NUM_SAFE(m.balance, 0),
    lifetimeMined: NUM_SAFE(m.lifetimeMined, 0),
    connected: Boolean(m.connected),
    estimatedHashRate: NUM_SAFE(m.estimatedHashRate, 0),
    baseHashRate: NUM_SAFE(m.baseHashRate, 0),
    activeTemporaryHashRate: NUM_SAFE(m.activeTemporaryHashRate, 0),
    boostMultiplier: Math.min(1e6, Math.max(0, NUM_SAFE(m.boostMultiplier, 1))),
    refCode: m.refCode == null ? null : sanitizeRefCode(m.refCode) || null,
    referralCount: Math.max(0, Math.trunc(NUM_SAFE(m.referralCount, 0)))
  };
}

/**
 * Returns a plain JSON-safe object for Socket.IO `state:update` (never trust in-memory shape across versions).
 * @param {unknown} raw
 * @returns {Record<string, unknown>|null}
 */
export function sanitizePublicStateForSocket(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = /** @type {Record<string, unknown>} */ (raw);

  const miner = s.miner != null ? sanitizeMiner(s.miner) : null;

  const base = {
    serverTime: Math.trunc(NUM_SAFE(s.serverTime, Date.now())),
    tokenSymbol: String(s.tokenSymbol ?? "POL").slice(0, 8),
    tokenPrice: NUM_SAFE(s.tokenPrice, 0),
    blockReward: NUM_SAFE(s.blockReward, 0),
    blockIntervalMinutes: NUM_SAFE(s.blockIntervalMinutes, 0),
    blockNumber: Math.trunc(NUM_SAFE(s.blockNumber, 0)),
    blockProgress: NUM_SAFE(s.blockProgress, 0),
    blockCountdownSeconds: Math.max(0, Math.trunc(NUM_SAFE(s.blockCountdownSeconds, 0))),
    totalMiners: Math.max(0, Math.trunc(NUM_SAFE(s.totalMiners, 0))),
    activeMiners: Math.max(0, Math.trunc(NUM_SAFE(s.activeMiners, 0))),
    networkHashRate: NUM_SAFE(s.networkHashRate, 0),
    totalMinted: NUM_SAFE(s.totalMinted, 0),
    lastReward: NUM_SAFE(s.lastReward, 0),
    blockHistory: sanitizeBlockHistory(s.blockHistory),
    miner,
  };

  if (!Array.isArray(s.leaderboard)) {
    return base;
  }

  const leaderboard = s.leaderboard.slice(0, 50).map((row) => {
    if (!row || typeof row !== "object") {
      return { id: "", username: "?", rigs: 0, active: false, lifetimeMined: 0, currentHashRate: 0 };
    }
    const r = row as Record<string, unknown>;
    return {
      id: typeof r.id === "string" ? r.id.slice(0, 48) : String(r.id ?? "").slice(0, 48),
      username: sanitizeUsername(r.username),
      rigs: Math.max(0, Math.trunc(NUM_SAFE(r.rigs, 0))),
      active: Boolean(r.active),
      lifetimeMined: NUM_SAFE(r.lifetimeMined, 0),
      currentHashRate: NUM_SAFE(r.currentHashRate, 0),
    };
  });

  return { ...base, leaderboard };
}
