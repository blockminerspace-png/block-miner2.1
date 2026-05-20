#!/usr/bin/env node
/**
 * Remove QA test users from production (dry-run by default).
 *
 * Env:
 *   QA_CLEANUP_CONFIRM=YES     — apply deletes (default: dry-run)
 *   QA_CLEANUP_BACKUP_DIR      — default /root/blockminer-backups/qa-cleanup
 *   DATABASE_URL               — required (run inside app container on VM)
 */
import fs from "node:fs";
import path from "node:path";
import prisma from "../dist/server/src/db/prisma.js";
import { isQaTestUserRecord, prismaQaUserWhere } from "./qa-test-user-patterns.mjs";

const DRY_RUN = process.env.QA_CLEANUP_CONFIRM !== "YES";
const BACKUP_DIR =
  process.env.QA_CLEANUP_BACKUP_DIR || "/root/blockminer-backups/qa-cleanup";

function maskEmail(email) {
  const e = String(email || "");
  const at = e.indexOf("@");
  if (at < 2) return "…";
  return `${e.slice(0, 2)}…${e.slice(at)}`;
}

async function countRelations(userIds) {
  if (userIds.length === 0) return {};
  const where = { userId: { in: userIds } };
  const [
    dailyCheckins,
    streakRewards,
    ownedMachines,
    userInventory,
    transactions,
    deposits,
    withdrawals,
    supportMessages,
    depositTickets,
    ccpayment,
    refreshTokens,
    sessions,
    auditLogs,
  ] = await Promise.all([
    prisma.dailyCheckin.count({ where }),
    prisma.userCheckinStreakReward.count({ where }),
    prisma.userOwnedMachine.count({ where }),
    prisma.userInventory.count({ where }),
    prisma.transaction.count({ where }),
    prisma.transaction.count({ where: { ...where, type: "deposit" } }),
    prisma.transaction.count({ where: { ...where, type: "withdrawal" } }),
    prisma.supportMessage.count({ where }),
    prisma.depositTicket.count({ where }),
    prisma.ccpaymentDepositEvent.count({ where: { userId: { in: userIds } } }),
    prisma.refreshToken.count({ where }),
    prisma.session.count({ where }),
    prisma.auditLog.count({ where }),
  ]);
  return {
    dailyCheckins,
    streakRewards,
    ownedMachines,
    userInventory,
    transactions,
    deposits,
    withdrawals,
    supportMessages,
    depositTickets,
    ccpayment,
    refreshTokens,
    sessions,
    auditLogs,
  };
}

function classifyRisk(user, rel) {
  if (rel.deposits > 0 || rel.withdrawals > 0 || rel.ccpayment > 0) return "alto";
  if (rel.supportMessages > 0 || rel.depositTickets > 0) return "alto";
  if (!isQaTestUserRecord(user)) return "alto";
  if (rel.ownedMachines > 0 || rel.dailyCheckins > 0 || rel.streakRewards > 0) return "medio";
  return "baixo";
}

async function exportBackup(users, relById) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(BACKUP_DIR, stamp);
  fs.mkdirSync(dir, { recursive: true });
  const payload = users.map((u) => ({
    id: u.id,
    username: u.username,
    email: maskEmail(u.email),
    createdAt: u.createdAt,
    polBalance: Number(u.polBalance),
    hasWallet: Boolean(u.walletAddress),
    relations: relById.get(u.id),
    risk: classifyRisk(u, relById.get(u.id) || {}),
  }));
  fs.writeFileSync(path.join(dir, "qa-users-summary.json"), JSON.stringify(payload, null, 2));
  return dir;
}

async function deleteQaUserData(userIds) {
  const where = { userId: { in: userIds } };
  await prisma.userInventory.deleteMany({ where });
  await prisma.userOwnedMachine.deleteMany({ where });
  await prisma.userCheckinStreakReward.deleteMany({ where });
  await prisma.dailyCheckin.deleteMany({ where });
  await prisma.periodicCheckin.deleteMany({ where });
  await prisma.refreshToken.deleteMany({ where });
  await prisma.session.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.userMiner.deleteMany({ where });
  await prisma.userPowerGame.deleteMany({ where });
  await prisma.userVault.deleteMany({ where });
  await prisma.transaction.deleteMany({ where });
  await prisma.supportMessage.deleteMany({ where });
  await prisma.depositTicket.deleteMany({ where });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  const users = await prisma.user.findMany({
    where: prismaQaUserWhere(),
    orderBy: { id: "desc" },
    select: {
      id: true,
      username: true,
      email: true,
      createdAt: true,
      polBalance: true,
      walletAddress: true,
    },
  });

  const relById = new Map();
  const allIds = users.map((u) => u.id);
  const totalRel = await countRelations(allIds);
  for (const u of users) {
    const rel = await countRelations([u.id]);
    relById.set(u.id, rel);
  }

  const report = {
    mode: DRY_RUN ? "dry-run" : "apply",
    found: users.length,
    totalRelations: totalRel,
    toRemove: [],
    blocked: [],
  };

  for (const u of users) {
    const rel = relById.get(u.id) || {};
    const risk = classifyRisk(u, rel);
    const row = {
      userId: u.id,
      username: u.username,
      email: maskEmail(u.email),
      createdAt: u.createdAt,
      polBalance: Number(u.polBalance),
      risk,
      action: risk === "alto" ? "manter" : "remover",
      relations: rel,
    };
    if (risk === "alto") report.blocked.push(row);
    else report.toRemove.push(row);
  }

  let backupDir = null;
  if (!DRY_RUN && report.toRemove.length > 0) {
    backupDir = await exportBackup(
      users.filter((u) => report.toRemove.some((r) => r.userId === u.id)),
      relById,
    );
    const removeIds = report.toRemove.map((r) => r.userId);
    await prisma.$transaction(async () => {
      await deleteQaUserData(removeIds);
    });
  }

  report.backupDir = backupDir;
  report.removedCount = DRY_RUN ? 0 : report.toRemove.length;
  report.blockedCount = report.blocked.length;

  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e?.message || String(e) }));
  process.exit(1);
});
