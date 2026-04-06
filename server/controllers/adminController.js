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

  await new Promise(r => setTimeout(r, sampleMs));

  const after = os.cpus().reduce((acc, cpu) => {
    acc.idle += cpu.times.idle;
    acc.total += Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return acc;
  }, { idle: 0, total: 0 });

  const idleDelta = after.idle - before.idle;
  const totalDelta = after.total - before.total;
  return totalDelta <= 0 ? 0 : Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
}

async function collectServerMetrics() {
  const cpuUsage = await measureCpuUsagePercent();
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const memUsed = memTotal - memFree;

  let diskTotal = 500 * 1024 ** 3;
  let diskUsed = 50 * 1024 ** 3;
  try {
    const { execSync } = await import('child_process');
    const lines = execSync('df -k / --output=size,used', { timeout: 2000 }).toString().split('\n');
    const parts = lines[1].trim().split(/\s+/);
    diskTotal = parseInt(parts[0]) * 1024;
    diskUsed = parseInt(parts[1]) * 1024;
  } catch {}

  return {
    serverCpuUsagePercent: cpuUsage,
    serverCpuCores: os.cpus().length,
    serverMemoryTotalBytes: memTotal,
    serverMemoryFreeBytes: memFree,
    serverMemoryUsedBytes: memUsed,
    serverMemoryUsagePercent: (memUsed / memTotal) * 100,
    serverDiskTotalBytes: diskTotal,
    serverDiskUsedBytes: diskUsed,
    serverDiskUsagePercent: (diskUsed / diskTotal) * 100,
    uptimeSeconds: process.uptime(),
    platform: process.platform,
    nodeVersion: process.version,
    processId: process.pid,
  };
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
    const normalized = withdrawals.map(w => ({ ...w, amount: Number(w.amount) }));
    res.json({ ok: true, withdrawals: normalized });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Load failed" });
  }
}

export async function approveWithdrawal(req, res) {
  try {
    const { withdrawalId } = req.params;
    await prisma.transaction.update({
      where: { id: Number(withdrawalId) },
      data: { status: 'approved', updatedAt: new Date() }
    });
    res.json({ ok: true, message: "Withdrawal approved" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Approval failed" });
  }
}

export async function rejectWithdrawal(req, res) {
  try {
    const { withdrawalId } = req.params;
    await walletModel.updateTransactionStatus(Number(withdrawalId), "failed");
    res.json({ ok: true, message: "Withdrawal rejected" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Rejection failed" });
  }
}

export async function completeWithdrawal(req, res) {
  try {
    const { withdrawalId } = req.params;
    const { txHash } = req.body;
    await walletModel.updateTransactionStatus(Number(withdrawalId), "completed", txHash);
    res.json({ ok: true, message: "Withdrawal marked as completed" });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Marking as completed failed" });
  }
}
