import fs from "fs/promises";
import path from "path";
import os from "os";
import { promisify } from "util";
import { execFile } from "child_process";
import { fileURLToPath } from "url";
import prisma from "../src/db/prisma.js";
import * as minersModel from "../models/minersModel.js";
import * as walletModel from "../models/walletModel.js";
import * as userModel from "../models/userModel.js";
import loggerLib from "../utils/logger.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { enrichWithdrawalsWithCollisionHints } from "../services/adminAccountCollisionService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = loggerLib.child("AdminController");
const execFileAsync = promisify(execFile);

/** Avoid Boolean(\"false\") === true when clients send string booleans. */
function parseBoolInput(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0" || s === "") return false;
  }
  return Boolean(v);
}

function serializeMinerForAdmin(m) {
  if (!m) return m;
  return {
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
  };
}

function parseMinerWriteBody(b) {
  const body = b || {};
  const baseHashRate = Number(body.baseHashRate);
  const price = Number(body.price);
  const slotSize = Number(body.slotSize);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const imageUrl =
    body.imageUrl != null && String(body.imageUrl).trim() !== "" ? String(body.imageUrl).trim() : null;
  const isActive = parseBoolInput(body.isActive);
  const showInShop = parseBoolInput(body.showInShop);
  const errors = [];
  if (!Number.isFinite(baseHashRate) || baseHashRate < 0) errors.push("Invalid baseHashRate (must be a number ≥ 0).");
  if (!Number.isFinite(price) || price < 0) errors.push("Invalid price.");
  if (![1, 2].includes(slotSize)) errors.push("slotSize must be 1 or 2.");
  if (!name) errors.push("Name is required.");
  if (!slug) errors.push("Slug is required.");
  return {
    ok: errors.length === 0,
    message: errors[0] || null,
    data: { name, slug, baseHashRate, price, slotSize, imageUrl, isActive, showInShop }
  };
}

// Utility: Server Metrics
async function measureCpuUsagePercent(sampleMs = 300) {
  const before = os.cpus().reduce((acc, cpu) => {
    acc.idle += cpu.times.idle;
    acc.total += Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return acc;
  }, { idle: 0, total: 0 });

  await new Promise((r) => setTimeout(r, sampleMs));

  const after = os.cpus().reduce((acc, cpu) => {
    acc.idle += cpu.times.idle;
    acc.total += Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return acc;
  }, { idle: 0, total: 0 });

  const idleDelta = after.idle - before.idle;
  const totalDelta = after.total - before.total;
  return totalDelta <= 0 ? 0 : Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
}

/**
 * Root filesystem usage (host or container /), for admin dashboards.
 * Prefers fs.statfs (no subprocess); falls back to POSIX `df -kP /`.
 * @returns {Promise<{ totalBytes: number, usedBytes: number, diskUsagePercent: number } | null>}
 */
async function readRootDiskUsageBytes() {
  try {
    const { statfs } = await import("fs/promises");
    if (typeof statfs === "function") {
      const s = await statfs("/");
      const bsize = Number(s.bsize);
      const blocks = Number(s.blocks);
      const bavail = Number(s.bavail);
      if (Number.isFinite(bsize) && bsize > 0 && Number.isFinite(blocks) && blocks > 0) {
        const totalBytes = blocks * bsize;
        const availBytes = Number.isFinite(bavail) ? Math.max(0, bavail) * bsize : 0;
        const usedBytes = Math.max(0, Math.min(totalBytes, totalBytes - availBytes));
        const diskUsagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
        return { totalBytes, usedBytes, diskUsagePercent };
      }
    }
  } catch {
    // fall through to df
  }

  try {
    const { stdout } = await execFileAsync("df", ["-kP", "/"], { timeout: 2000 });
    const lines = stdout.trim().split("\n").filter(Boolean);
    if (lines.length < 2) return null;
    const parts = lines[1].trim().split(/\s+/);
    if (parts.length < 3) return null;
    const blocks1k = parseInt(parts[1], 10);
    const used1k = parseInt(parts[2], 10);
    if (!Number.isFinite(blocks1k) || !Number.isFinite(used1k) || blocks1k <= 0) return null;
    const totalBytes = blocks1k * 1024;
    const usedBytes = Math.max(0, Math.min(totalBytes, used1k * 1024));
    const diskUsagePercent = (usedBytes / totalBytes) * 100;
    return { totalBytes, usedBytes, diskUsagePercent };
  } catch {
    return null;
  }
}

async function collectServerMetrics() {
  const cpuUsage = await measureCpuUsagePercent();
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const memUsed = memTotal - memFree;

  const disk = await readRootDiskUsageBytes();

  return {
    serverCpuUsagePercent: cpuUsage,
    serverCpuCores: os.cpus().length,
    serverMemoryTotalBytes: memTotal,
    serverMemoryFreeBytes: memFree,
    serverMemoryUsedBytes: memUsed,
    serverMemoryUsagePercent: memTotal > 0 ? (memUsed / memTotal) * 100 : 0,
    serverDiskTotalBytes: disk?.totalBytes ?? null,
    serverDiskUsedBytes: disk?.usedBytes ?? null,
    serverDiskUsagePercent: disk?.diskUsagePercent ?? null,
    serverDiskMetricsAvailable: Boolean(disk),
    uptimeSeconds: process.uptime(),
    platform: process.platform,
    nodeVersion: process.version,
    processId: process.pid,
  };
}

/** JSON shape expected by `client/src/pages/AdminMetrics.jsx` */
export async function getServerMetrics(_req, res) {
  try {
    const m = await collectServerMetrics();
    res.json({
      ok: true,
      metrics: {
        cpuUsagePercent: m.serverCpuUsagePercent,
        cpuCores: m.serverCpuCores,
        memoryTotalBytes: m.serverMemoryTotalBytes,
        memoryFreeBytes: m.serverMemoryFreeBytes,
        memoryUsedBytes: m.serverMemoryUsedBytes,
        memoryUsagePercent: m.serverMemoryUsagePercent,
        diskTotalBytes: m.serverDiskTotalBytes,
        diskUsedBytes: m.serverDiskUsedBytes,
        diskUsagePercent: m.serverDiskUsagePercent,
        diskUnavailable: !m.serverDiskMetricsAvailable,
        uptimeSeconds: m.uptimeSeconds,
        platform: m.platform,
        nodeVersion: m.nodeVersion,
        processId: m.processId,
      },
    });
  } catch (error) {
    logger.error("getServerMetrics failed", { error: error?.message || String(error) });
    res.status(500).json({ ok: false, message: "Unable to load server metrics." });
  }
}

export async function getStats(_req, res) {
  try {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [usersTotal, usersBanned, usersNew24h, minersTotal, minersActive, balances, tx24h] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isBanned: true } }),
      prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.miner.count(),
      prisma.userMiner.count({ where: { isActive: true } }),
      prisma.user.aggregate({ _sum: { polBalance: true } }),
      prisma.transaction.count({ where: { createdAt: { gte: dayAgo } } })
    ]);

    const metrics = await collectServerMetrics();

    let miningBlockRewardPol = 0.3;
    let miningBlockIntervalMinutes = 10;
    try {
      const engine = getMiningEngine();
      if (engine && Number.isFinite(Number(engine.rewardBase))) {
        miningBlockRewardPol = Number(engine.rewardBase);
      }
      if (engine && Number.isFinite(Number(engine.blockDurationMs)) && Number(engine.blockDurationMs) > 0) {
        miningBlockIntervalMinutes = Number(engine.blockDurationMs) / 60000;
      }
    } catch {
      /* engine not booted in some tests */
    }

    res.json({
      ok: true,
      stats: {
        usersTotal,
        usersBanned,
        usersNew24h,
        minersTotal,
        minersActive,
        balanceTotal: Number(balances._sum.polBalance || 0),
        transactions24h: tx24h,
        miningBlockRewardPol,
        miningBlockIntervalMinutes,
        ...metrics
      }
    });
  } catch (error) {
    logger.error("Admin stats error", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to load admin stats." });
  }
}

export async function listRecentUsers(req, res) {
  try {
    const page = Math.max(1, Number(req.query?.page || 1));
    const pageSize = Math.min(100, Number(req.query?.pageSize || 25));
    const query = req.query?.q;
    const fromDate = req.query?.from;
    const toDate = req.query?.to;

    const { users, total } = await userModel.listUsers({ page, pageSize, query, fromDate, toDate });
    res.json({ ok: true, users, page, pageSize, total });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to load users." });
  }
}

export async function setUserBan(req, res) {
  try {
    const userId = Number(req.params?.id);
    const { isBanned } = req.body;
    await prisma.user.update({ where: { id: userId }, data: { isBanned: Boolean(isBanned) } });
    res.json({ ok: true, message: isBanned ? "User banned" : "User unbanned" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Update failed" });
  }
}

export async function listMiners(_req, res) {
  try {
    const rows = await minersModel.listAllMiners();
    const miners = rows.map(serializeMinerForAdmin);
    res.json({ ok: true, miners });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Load failed" });
  }
}

export async function createMiner(req, res) {
  try {
    const parsed = parseMinerWriteBody(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ ok: false, message: parsed.message });
    }
    const miner = await minersModel.createMiner(parsed.data);
    res.json({ ok: true, miner: serializeMinerForAdmin(miner) });
  } catch (error) {
    logger.error("Admin createMiner", { error: error.message, code: error.code });
    const msg =
      error.code === "P2002"
        ? "Slug must be unique."
        : error.message || "Creation failed";
    res.status(500).json({ ok: false, message: msg });
  }
}

export async function updateMiner(req, res) {
  try {
    const minerId = Number(req.params.id);
    if (!Number.isFinite(minerId) || minerId < 1) {
      return res.status(400).json({ ok: false, message: "Invalid miner id." });
    }
    const parsed = parseMinerWriteBody(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ ok: false, message: parsed.message });
    }
    const miner = await minersModel.updateMiner(minerId, parsed.data);
    res.json({ ok: true, miner: serializeMinerForAdmin(miner) });
  } catch (error) {
    logger.error("Admin updateMiner", { error: error.message, code: error.code });
    const msg =
      error.code === "P2002"
        ? "Slug must be unique."
        : error.code === "P2025"
          ? "Miner not found."
          : error.message || "Update failed";
    res.status(500).json({ ok: false, message: msg });
  }
}

export async function listPendingWithdrawals(_req, res) {
  try {
    const withdrawals = await walletModel.getPendingWithdrawals();
    const withHints = await enrichWithdrawalsWithCollisionHints(prisma, withdrawals);
    const normalized = withHints.map((w) => ({ ...w, amount: Number(w.amount) }));
    res.json({ ok: true, withdrawals: normalized });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Load failed" });
  }
}

function isValidPolygonTxHash(h) {
  return typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h.trim());
}

export async function approveWithdrawal(req, res) {
  try {
    const id = Number(req.params.withdrawalId);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, message: "Invalid withdrawal id" });
    }
    const row = await prisma.transaction.findUnique({ where: { id } });
    if (!row || row.type !== "withdrawal") {
      return res.status(404).json({ ok: false, message: "Withdrawal not found" });
    }
    if (row.status !== "pending") {
      return res.status(400).json({ ok: false, message: "Only pending withdrawals can be approved" });
    }
    await prisma.transaction.update({
      where: { id },
      data: { status: "approved", updatedAt: new Date() }
    });
    res.json({ ok: true, message: "Withdrawal approved" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Approval failed" });
  }
}

export async function rejectWithdrawal(req, res) {
  try {
    const id = Number(req.params.withdrawalId);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, message: "Invalid withdrawal id" });
    }
    const row = await prisma.transaction.findUnique({ where: { id } });
    if (!row || row.type !== "withdrawal") {
      return res.status(404).json({ ok: false, message: "Withdrawal not found" });
    }
    if (!["pending", "approved"].includes(row.status)) {
      return res.status(400).json({ ok: false, message: "Cannot reject this withdrawal" });
    }
    await walletModel.updateTransactionStatus(id, "failed");
    res.json({ ok: true, message: "Withdrawal rejected" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Rejection failed" });
  }
}

export async function completeWithdrawal(req, res) {
  try {
    const id = Number(req.params.withdrawalId);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, message: "Invalid withdrawal id" });
    }
    const rawHash = req.body?.txHash;
    if (!isValidPolygonTxHash(rawHash)) {
      return res.status(400).json({
        ok: false,
        message: "txHash required (0x + 64 hex characters)"
      });
    }
    const txHash = rawHash.trim();
    const row = await prisma.transaction.findUnique({ where: { id } });
    if (!row || row.type !== "withdrawal") {
      return res.status(404).json({ ok: false, message: "Withdrawal not found" });
    }
    if (row.status === "completed") {
      return res.status(400).json({ ok: false, message: "Withdrawal already completed" });
    }
    if (!["pending", "approved"].includes(row.status)) {
      return res.status(400).json({ ok: false, message: "Cannot complete this withdrawal" });
    }
    await walletModel.updateTransactionStatus(id, "completed", txHash);
    res.json({ ok: true, message: "Withdrawal marked as completed" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Marking as completed failed" });
  }
}
