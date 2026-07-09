#!/usr/bin/env node
/**
 * Export all account data for a user, then delete the user row (cascade).
 *
 * Usage (from repo root, inside app container or with DATABASE_URL):
 *   node scripts/admin/export-delete-user.mjs --username TeaH4nd
 *   node scripts/admin/export-delete-user.mjs --user-id 358 --out reports/account-deletions/TeaH4nd
 *   node scripts/admin/export-delete-user.mjs --username TeaH4nd --dry-run
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prisma from "../../dist/server/src/db/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

function parseArgs(argv) {
  let username = null;
  let userId = null;
  let outDir = null;
  let dryRun = false;
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--username") username = argv[++i];
    else if (a === "--user-id") userId = Number(argv[++i]);
    else if (a === "--out") outDir = argv[++i];
    else if (a === "--dry-run") dryRun = true;
  }
  return { username, userId, outDir, dryRun };
}

async function writeJson(dir, name, data) {
  const file = path.join(dir, name);
  await writeFile(file, JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  return file;
}

async function exportUserBundle(user) {
  const uid = user.id;
  const [
    ownedMachines,
    gameSessionLogs,
    userPowerGames,
    tournamentEntries,
    tournamentActions,
    auditLogs,
    transactions,
    deposits,
    checkins,
    internalOfferwall,
    ytHistory,
    ytPowers,
    shortlinkPowers,
    shortlinkCompletion,
    autoMiningV2Grants,
    gameCooldownStates,
    referralsOut,
    referralEarnings,
    energyTaxCharges,
    dailyTaskProgress,
    game2048Sessions,
    partnerGameSessions,
    refreshTokens,
    sessions,
    ipLogs,
    rewardInbox,
  ] = await Promise.all([
    prisma.userOwnedMachine.findMany({ where: { userId: uid } }),
    prisma.gameSessionLog.findMany({ where: { userId: uid }, orderBy: { createdAt: "asc" } }),
    prisma.userPowerGame.findMany({ where: { userId: uid }, orderBy: { playedAt: "asc" } }),
    prisma.tournamentEntry.findMany({ where: { userId: uid }, include: { tournament: { select: { id: true, name: true, metric: true, status: true, startsAt: true, endsAt: true } } } }),
    prisma.tournamentAction.findMany({ where: { userId: uid }, orderBy: { executedAtUTC: "asc" } }),
    prisma.auditLog.findMany({ where: { userId: uid }, orderBy: { createdAt: "asc" }, take: 50000 }),
    prisma.transaction.findMany({ where: { userId: uid }, orderBy: { createdAt: "asc" } }),
    prisma.ccpaymentDepositEvent.findMany({ where: { userId: uid }, orderBy: { createdAt: "asc" } }),
    prisma.dailyCheckin.findMany({ where: { userId: uid }, orderBy: { id: "asc" } }),
    prisma.internalOfferwallAttempt.findMany({ where: { userId: uid }, orderBy: { startedAt: "asc" } }),
    prisma.youtubeWatchHistory.findMany({ where: { userId: uid }, orderBy: { claimedAt: "asc" } }),
    prisma.youtubeWatchPower.findMany({ where: { userId: uid }, orderBy: { claimedAt: "asc" } }),
    prisma.shortlinkPower.findMany({ where: { userId: uid } }),
    prisma.shortlinkCompletion.findUnique({ where: { userId: uid } }),
    prisma.autoMiningV2PowerGrant.findMany({ where: { userId: uid }, orderBy: { earnedAt: "asc" } }),
    prisma.gameCooldownState.findMany({ where: { userId: uid } }),
    prisma.referral.findMany({ where: { referrerId: uid }, include: { referred: { select: { id: true, username: true, email: true } } } }),
    prisma.referralEarning.findMany({ where: { referrerId: uid }, orderBy: { createdAt: "asc" } }),
    prisma.energyTaxCharge.findMany({ where: { userId: uid }, orderBy: { createdAt: "asc" } }),
    prisma.userDailyTaskProgress.findMany({ where: { userId: uid } }),
    prisma.game2048Session.findMany({ where: { userId: uid }, orderBy: { createdAt: "asc" } }),
    prisma.partnerGameSession.findMany({ where: { userId: uid }, orderBy: { startedAt: "asc" } }),
    prisma.refreshToken.findMany({ where: { userId: uid } }),
    prisma.session.findMany({ where: { userId: uid } }),
    prisma.userIpLog.findMany({ where: { userId: uid }, orderBy: { lastSeen: "asc" } }),
    prisma.userRewardInbox.findMany({ where: { userId: uid }, orderBy: { createdAt: "asc" } }),
  ]);

  const powerWithGame = await prisma.userPowerGame.findMany({
    where: { userId: uid },
    include: { game: { select: { slug: true, name: true } } },
    orderBy: { playedAt: "asc" },
  });

  const winsBySlug = {};
  for (const row of gameSessionLogs) {
    if (!row.success || !row.rewardGranted) continue;
    winsBySlug[row.gameSlug] = (winsBySlug[row.gameSlug] || 0) + 1;
  }

  return {
    user,
    summary: {
      exportedAt: new Date().toISOString(),
      gameSessionLogs: gameSessionLogs.length,
      gameWins: gameSessionLogs.filter((r) => r.success && r.rewardGranted).length,
      winsBySlug,
      userPowerGameRows: userPowerGames.length,
      auditLogs: auditLogs.length,
      tournamentEntries: tournamentEntries.length,
      ownedMachines: ownedMachines.length,
      referralsOut: referralsOut.length,
    },
    tables: {
      ownedMachines,
      gameSessionLogs,
      userPowerGames: powerWithGame,
      tournamentEntries,
      tournamentActions,
      auditLogs,
      transactions,
      deposits,
      checkins,
      internalOfferwall,
      ytHistory,
      ytPowers,
      shortlinkPowers,
      shortlinkCompletion,
      autoMiningV2Grants,
      gameCooldownStates,
      referralsOut,
      referralEarnings,
      energyTaxCharges,
      dailyTaskProgress,
      game2048Sessions,
      partnerGameSessions,
      refreshTokens,
      sessions,
      ipLogs,
      rewardInbox,
    },
  };
}

function buildMarkdown(user, bundle) {
  const s = bundle.summary;
  const lines = [
    `# Account deletion report — ${user.username || user.email} (id ${user.id})`,
    "",
    `Exported at: **${s.exportedAt}**`,
    "",
    "## Profile",
    "",
    "| Field | Value |",
    "|---|---|",
    `| Email | ${user.email} |`,
    `| Username | ${user.username ?? "—"} |`,
    `| Created | ${user.createdAt} |`,
    `| Last login | ${user.lastLoginAt ?? "—"} |`,
    `| Wallet | ${user.walletAddress ?? "—"} |`,
    `| POL balance | ${user.polBalance} |`,
    `| BLK balance | ${user.blkBalance} |`,
    `| Banned | ${user.isBanned} |`,
    `| Ref code | ${user.refCode ?? "—"} |`,
    "",
    "## Activity summary",
    "",
    `| Metric | Count |`,
    `|---|---|`,
    ...Object.entries(s).filter(([k]) => k !== "exportedAt" && k !== "winsBySlug").map(([k, v]) => `| ${k} | ${v} |`),
    "",
    "### Wins by game slug",
    "",
    ...Object.entries(s.winsBySlug).map(([slug, n]) => `- **${slug}**: ${n}`),
    "",
    "## Tournament entries",
    "",
    ...bundle.tables.tournamentEntries.map(
      (e) => `- Tournament #${e.tournamentId} **${e.tournament?.name}** (${e.tournament?.metric}) — score **${e.score}**`,
    ),
    "",
    "## Verdict",
    "",
    "Account exported and removed from production database per admin request.",
    "",
  ];
  return lines.join("\n");
}

/** Delete rows that block `users` delete (FK RESTRICT / NO ACTION). CASCADE children are removed by user.delete(). */
async function purgeUserBlockingRows(userId) {
  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({ where: { referredBy: userId }, data: { referredBy: null } });

    await tx.referralEarning.deleteMany({ where: { OR: [{ referrerId: userId }, { referredId: userId }] } });
    await tx.referral.deleteMany({ where: { OR: [{ referrerId: userId }, { referredId: userId }] } });
    await tx.privateMessage.deleteMany({ where: { OR: [{ senderId: userId }, { receiverId: userId }] } });
    await tx.autoMiningGpuLog.deleteMany({ where: { userId } });
    await tx.autoMiningGpu.deleteMany({ where: { userId } });
    await tx.chatMessage.deleteMany({ where: { userId } });
    await tx.checkinStreakRecovery.deleteMany({ where: { userId } });
    await tx.dailyCheckin.deleteMany({ where: { userId } });
    await tx.faucetClaim.deleteMany({ where: { userId } });
    await tx.faucetPartnerVisit.deleteMany({ where: { userId } });
    await tx.miningRewardsLog.deleteMany({ where: { userId } });
    await tx.payout.deleteMany({ where: { userId } });
    await tx.ptpAd.deleteMany({ where: { userId } });
    await tx.ptpEarning.deleteMany({ where: { userId } });
    await tx.ptpSession.deleteMany({ where: { userId } });
    await tx.rackConfig.deleteMany({ where: { userId } });
    await tx.refreshToken.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.shortlinkCompletion.deleteMany({ where: { userId } });
    await tx.shortlinkPower.deleteMany({ where: { userId } });
    await tx.transaction.deleteMany({ where: { userId } });
    await tx.userInventory.deleteMany({ where: { userId } });
    await tx.userMiner.deleteMany({ where: { userId } });
    await tx.userVault.deleteMany({ where: { userId } });
    await tx.userRewardInbox.deleteMany({ where: { userId } });
    await tx.userPowerGame.deleteMany({ where: { userId } });
    await tx.youtubeWatchHistory.deleteMany({ where: { userId } });
    await tx.youtubeWatchPower.deleteMany({ where: { userId } });
  });
}

async function main() {
  const { username, userId, outDir, dryRun } = parseArgs(process.argv);
  if (!username && !userId) {
    console.error("Provide --username or --user-id");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: userId ? { id: userId } : { OR: [{ username }, { username: { equals: username, mode: "insensitive" } }] },
  });
  if (!user) {
    console.error("User not found");
    process.exit(1);
  }

  const slug = user.username || `user-${user.id}`;
  const targetDir = path.resolve(outDir || path.join(REPO_ROOT, "reports/account-deletions", `${slug}-${user.id}-${new Date().toISOString().slice(0, 10)}`));
  await mkdir(targetDir, { recursive: true });

  console.log(`Exporting user ${user.id} (${user.username}) -> ${targetDir}`);
  const bundle = await exportUserBundle(user);

  await writeJson(targetDir, "user.json", bundle.user);
  await writeJson(targetDir, "summary.json", bundle.summary);
  await writeJson(targetDir, "full-export.json", bundle.tables);
  await writeFile(path.join(targetDir, "REPORT.md"), buildMarkdown(user, bundle));

  if (dryRun) {
    console.log("Dry run — user NOT deleted");
    await prisma.$disconnect();
    return;
  }

  console.log("Purging FK-blocking rows...");
  await purgeUserBlockingRows(user.id);
  await prisma.user.delete({ where: { id: user.id } });
  await writeJson(targetDir, "deletion.json", {
    deletedAt: new Date().toISOString(),
    userId: user.id,
    username: user.username,
    email: user.email,
  });
  console.log(`Deleted user ${user.id} from database`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
