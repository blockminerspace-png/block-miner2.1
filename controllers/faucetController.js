const { get, run } = require("../models/db");
const { addInventoryItem } = require("../models/inventoryModel");
const minersModel = require("../models/minersModel");
const { getBrazilCheckinDateKey } = require("../utils/checkinDate");
const DEFAULT_MINER_IMAGE_URL = "/assets/machines/reward1.png";

const DEFAULT_FAUCET_COOLDOWN_MS = 60 * 60 * 1000;
const FAUCET_PARTNER_WAIT_MS = 5_000;
const FAUCET_PARTNER_READY_WINDOW_MS = 30_000;
const FAUCET_PARTNER_URL = String(process.env.FAUCET_PARTNER_URL || "https://faucetpay.io/").trim();

async function getActiveReward() {
  let reward = null;
  try {
    reward = await get(
      "SELECT id, miner_id, cooldown_ms FROM faucet_rewards WHERE is_active = 1 ORDER BY id DESC LIMIT 1"
    );
  } catch (error) {
    if (String(error?.message || "").includes("no such column: cooldown_ms")) {
      reward = await get("SELECT id, miner_id FROM faucet_rewards WHERE is_active = 1 ORDER BY id DESC LIMIT 1");
    } else {
      throw error;
    }
  }

  if (!reward?.miner_id) {
    return null;
  }

  const miner = await minersModel.getMinerById(reward.miner_id);
  if (!miner) {
    return null;
  }

  return {
    rewardId: reward.id,
    cooldownMs: Number(reward.cooldown_ms || DEFAULT_FAUCET_COOLDOWN_MS),
    miner
  };
}

function buildStatusPayload(record, now, cooldownMs) {
  if (!record) {
    return {
      available: true,
      remainingMs: 0,
      nextClaimAt: null,
      totalClaims: 0
    };
  }

  const nextClaimAt = Number(record.claimed_at) + cooldownMs;
  const remainingMs = Math.max(0, nextClaimAt - now);

  return {
    available: remainingMs === 0,
    remainingMs,
    nextClaimAt,
    totalClaims: Number(record.total_claims || 0)
  };
}

async function normalizeFaucetRecord(userId, record) {
  const todayKey = getBrazilCheckinDateKey();
  if (!record) {
    return { record: null, todayKey };
  }

  const recordKey = String(record.day_key || "").trim();
  if (recordKey && recordKey === todayKey) {
    return { record, todayKey };
  }

  await run(
    "UPDATE faucet_claims SET claimed_at = 0, total_claims = 0, day_key = ? WHERE user_id = ?",
    [todayKey, userId]
  );

  return {
    record: { ...record, claimed_at: 0, total_claims: 0, day_key: todayKey },
    todayKey
  };
}

async function getPartnerVisitForToday(userId, dayKey) {
  return get(
    "SELECT opened_at, eligible_at, day_key FROM faucet_partner_visits WHERE user_id = ? AND day_key = ?",
    [userId, dayKey]
  );
}

function buildPartnerGateStatus({ record, visit, now, todayKey, remainingMs }) {
  const lastClaimAt = Number(record?.claimed_at || 0);
  const visitOpenedAt = Number(visit?.opened_at || 0);
  const visitEligibleAt = Number(visit?.eligible_at || 0);
  const hasFreshVisit = visitOpenedAt > 0 && visitOpenedAt > lastClaimAt && String(visit?.day_key || "") === todayKey;
  const waitRemainingMs = hasFreshVisit ? Math.max(0, visitEligibleAt - now) : 0;
  const readyWindowRemainingMs = hasFreshVisit ? Math.max(0, visitEligibleAt + FAUCET_PARTNER_READY_WINDOW_MS - now) : 0;
  const partnerReady = hasFreshVisit && waitRemainingMs === 0 && readyWindowRemainingMs > 0;
  const cooldownActive = Number(remainingMs || 0) > 0;

  return {
    required: true,
    url: FAUCET_PARTNER_URL,
    waitMs: FAUCET_PARTNER_WAIT_MS,
    readyWindowMs: FAUCET_PARTNER_READY_WINDOW_MS,
    readyWindowRemainingMs: cooldownActive ? 0 : readyWindowRemainingMs,
    cooldownActive,
    ready: cooldownActive ? false : partnerReady,
    waitRemainingMs: cooldownActive ? 0 : waitRemainingMs
  };
}

async function startPartnerVisit(req, res) {
  try {
    const now = Date.now();
    const todayKey = getBrazilCheckinDateKey();
    const eligibleAt = now + FAUCET_PARTNER_WAIT_MS;

    await run(
      `INSERT INTO faucet_partner_visits (user_id, day_key, opened_at, eligible_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, day_key)
       DO UPDATE SET opened_at = excluded.opened_at, eligible_at = excluded.eligible_at, updated_at = excluded.updated_at`,
      [req.user.id, todayKey, now, eligibleAt, now, now]
    );

    res.json({
      ok: true,
      partnerUrl: FAUCET_PARTNER_URL,
      waitMs: FAUCET_PARTNER_WAIT_MS,
      eligibleAt
    });
  } catch (error) {
    console.error("Error starting faucet partner visit:", error);
    res.status(500).json({ ok: false, message: "Unable to start partner visit." });
  }
}

async function getStatus(req, res) {
  try {
    const record = await get("SELECT claimed_at, total_claims, day_key FROM faucet_claims WHERE user_id = ?", [req.user.id]);
    const reward = await getActiveReward();
    if (!reward) {
      res.status(500).json({ ok: false, message: "Faucet reward not configured." });
      return;
    }

    const normalized = await normalizeFaucetRecord(req.user.id, record);
    const statusRecord = normalized.record;

    const now = Date.now();
    const payload = buildStatusPayload(statusRecord, now, reward.cooldownMs);
    const partnerVisit = await getPartnerVisitForToday(req.user.id, normalized.todayKey);
    const partnerGate = buildPartnerGateStatus({
      record: statusRecord,
      visit: partnerVisit,
      now,
      todayKey: normalized.todayKey,
      remainingMs: payload.remainingMs
    });

    res.json({
      ok: true,
      ...payload,
      canClaim: Boolean(payload.available && partnerGate.ready),
      partnerGate,
      reward: {
        id: reward.rewardId,
        minerId: reward.miner.id,
        name: reward.miner.name,
        hashRate: Number(reward.miner.base_hash_rate || 0),
        slotSize: Number(reward.miner.slot_size || 1),
        imageUrl: reward.miner.image_url || DEFAULT_MINER_IMAGE_URL
      }
    });
  } catch (error) {
    console.error("Error loading faucet status:", error);
    res.status(500).json({ ok: false, message: "Unable to load faucet status." });
  }
}

async function claim(req, res) {
  try {
    const now = Date.now();
    const record = await get("SELECT claimed_at, total_claims, day_key FROM faucet_claims WHERE user_id = ?", [req.user.id]);
    const reward = await getActiveReward();
    if (!reward) {
      res.status(500).json({ ok: false, message: "Faucet reward not configured." });
      return;
    }

    const normalized = await normalizeFaucetRecord(req.user.id, record);
    const status = buildStatusPayload(normalized.record, now, reward.cooldownMs);
    const partnerVisit = await getPartnerVisitForToday(req.user.id, normalized.todayKey);
    const partnerGate = buildPartnerGateStatus({
      record: normalized.record,
      visit: partnerVisit,
      now,
      todayKey: normalized.todayKey,
      remainingMs: status.remainingMs
    });

    if (!status.available) {
      res.status(429).json({ ok: false, message: "Faucet cooldown active.", remainingMs: status.remainingMs });
      return;
    }

    if (!partnerGate.ready) {
      res.status(400).json({
        ok: false,
        message: "Open partner link and wait 5 seconds before claiming faucet.",
        partnerGate
      });
      return;
    }

    const miner = reward.miner;
    await addInventoryItem(
      req.user.id,
      miner.name,
      1,
      Number(miner.base_hash_rate || 0),
      Number(miner.slot_size || 1),
      now,
      now,
      miner.id,
      miner.image_url || DEFAULT_MINER_IMAGE_URL
    );

    if (normalized.record) {
      await run(
        "UPDATE faucet_claims SET claimed_at = ?, total_claims = total_claims + 1, day_key = ? WHERE user_id = ?",
        [now, normalized.todayKey, req.user.id]
      );
    } else {
      await run(
        "INSERT INTO faucet_claims (user_id, claimed_at, total_claims, day_key) VALUES (?, ?, 1, ?)",
        [req.user.id, now, normalized.todayKey]
      );
    }

    res.json({
      ok: true,
      message: `Faucet claimed. ${miner.name} was added to your inventory.`,
      reward: {
        id: reward.rewardId,
        minerId: miner.id,
        name: miner.name,
        hashRate: Number(miner.base_hash_rate || 0),
        slotSize: Number(miner.slot_size || 1),
        imageUrl: miner.image_url || DEFAULT_MINER_IMAGE_URL
      },
      nextAvailableAt: now + reward.cooldownMs
    });
  } catch (error) {
    console.error("Error claiming faucet:", error);
    res.status(500).json({ ok: false, message: "Unable to claim faucet." });
  }
}

module.exports = {
  getStatus,
  claim,
  startPartnerVisit
};
