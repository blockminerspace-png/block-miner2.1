import prisma from "#server/src/db/prisma.js";
import {
  getCheckinPeriodEndKey,
  getDefaultCheckinConfig,
  getPeriodResetAt
} from "#server/modules/checkin/checkin.calendar.js";
import {
  addDaysToBrazilDateKey
} from "#server/utils/checkinDate.js";
import crypto from "node:crypto";

async function main() {
  console.log("=== STARTING CHECK-IN MIGRATION AND STREAK RECOVERY ===");

  const config = getDefaultCheckinConfig();
  console.log("Check-in configuration:", config);

  // 1. MIGRATION & MERGING OF KEYS
  console.log("\n--- Phase 1: Migrating and Merging checkinDate keys to Option B ---");
  const allCheckins = await prisma.dailyCheckin.findMany({
    orderBy: { createdAt: "asc" }
  });
  console.log(`Found ${allCheckins.length} total check-in records in DB.`);

  // Group check-ins by userId -> correct Option B dateKey -> list of rows
  const grouped = new Map();
  for (const row of allCheckins) {
    const correctKey = getCheckinPeriodEndKey(row.createdAt, config);
    if (!grouped.has(row.userId)) {
      grouped.set(row.userId, new Map());
    }
    const userMap = grouped.get(row.userId);
    if (!userMap.has(correctKey)) {
      userMap.set(correctKey, []);
    }
    userMap.get(correctKey).push(row);
  }

  let migratedCount = 0;
  let deletedCount = 0;

  for (const [userId, userMap] of grouped.entries()) {
    for (const [correctKey, rows] of userMap.entries()) {
      // Sort rows to pick the best one:
      // 1. confirmed first
      // 2. higher confirmedAt
      // 3. higher createdAt
      rows.sort((a, b) => {
        if (a.status === "confirmed" && b.status !== "confirmed") return -1;
        if (a.status !== "confirmed" && b.status === "confirmed") return 1;
        const aConfirmedTime = a.confirmedAt ? a.confirmedAt.getTime() : 0;
        const bConfirmedTime = b.confirmedAt ? b.confirmedAt.getTime() : 0;
        if (aConfirmedTime !== bConfirmedTime) return bConfirmedTime - aConfirmedTime;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      const bestRow = rows[0];
      
      // Update the best row to correctKey if it isn't already
      if (bestRow.checkinDate !== correctKey) {
        await prisma.dailyCheckin.update({
          where: { id: bestRow.id },
          data: { checkinDate: correctKey }
        });
        migratedCount++;
      }

      // Delete the other duplicate rows
      for (let i = 1; i < rows.length; i++) {
        await prisma.dailyCheckin.delete({
          where: { id: rows[i].id }
        });
        deletedCount++;
      }
    }
  }

  console.log(`Phase 1 Complete: Migrated/updated ${migratedCount} rows. Deleted ${deletedCount} duplicate/legacy rows.`);

  // 2. STREAK RECOVERY & EXTENSION
  console.log("\n--- Phase 2: Restoring and extending user streaks (+14 days) ---");
  
  // Find all users active in the last 24 days
  const activeSince = new Date(Date.now() - 24 * 24 * 60 * 60 * 1000);
  const activeUsers = await prisma.dailyCheckin.findMany({
    where: {
      createdAt: { gte: activeSince }
    },
    select: { userId: true },
    distinct: ["userId"]
  });
  const activeUserIds = activeUsers.map(u => u.userId);
  console.log(`Found ${activeUserIds.length} active users in the last 24 days.`);

  // We determine "today" period key
  const todayKey = getCheckinPeriodEndKey(new Date(), config);
  const yesterdayKey = addDaysToBrazilDateKey(todayKey, -1);

  let recoveredUsersCount = 0;
  let backfilledRowsCount = 0;

  for (const userId of activeUserIds) {
    // Get all check-ins for the user (already migrated)
    const userCheckins = await prisma.dailyCheckin.findMany({
      where: { userId },
      orderBy: { checkinDate: "desc" }
    });

    const confirmedCheckins = userCheckins.filter(c => c.status === "confirmed");
    const confirmedKeys = new Set(confirmedCheckins.map(c => c.checkinDate));

    // Find highest historical streak
    let maxStreak = 0;
    for (const c of userCheckins) {
      if (c.streak > maxStreak) {
        maxStreak = c.streak;
      }
    }

    // Also compute current dynamic streak to be safe
    let currentDynamic = 0;
    if (confirmedCheckins.length > 0) {
      let cursor = confirmedCheckins[0].checkinDate;
      while (confirmedKeys.has(cursor)) {
        currentDynamic++;
        cursor = addDaysToBrazilDateKey(cursor, -1);
      }
    }

    const baseStreak = Math.max(maxStreak, currentDynamic, 1);
    const targetStreak = baseStreak + 14;

    console.log(`User ID ${userId}: base streak = ${baseStreak}, target streak = ${targetStreak}`);

    // Reconstruct consecutive check-ins ending at endKey (todayKey or yesterdayKey)
    const endKey = confirmedKeys.has(todayKey) ? todayKey : yesterdayKey;

    for (let i = 0; i < targetStreak; i++) {
      const dateKey = addDaysToBrazilDateKey(endKey, -i);
      const expectedStreak = targetStreak - i;

      // Find if there's an existing check-in for this dateKey
      const existing = userCheckins.find(c => c.checkinDate === dateKey);

      // Period middle time for createdAt/confirmedAt
      const resetAt = getPeriodResetAt(dateKey, config);
      const periodTime = new Date(resetAt.getTime() - 4 * 3600000); // 4 hours before reset

      if (existing) {
        // Update to confirmed, set correct streak
        await prisma.dailyCheckin.update({
          where: { id: existing.id },
          data: {
            status: "confirmed",
            streak: expectedStreak,
            confirmedAt: existing.confirmedAt || periodTime
          }
        });
      } else {
        // Insert a new confirmed check-in
        const txHash = crypto.createHash("sha256")
          .update(`restored-streak-${userId}-${dateKey}-${Date.now()}`)
          .digest("hex");

        await prisma.dailyCheckin.create({
          data: {
            userId,
            checkinDate: dateKey,
            status: "confirmed",
            amount: 0.01,
            chainId: 137,
            paymentMethod: "internal_chain",
            streak: expectedStreak,
            txHash,
            createdAt: periodTime,
            confirmedAt: periodTime
          }
        });
        backfilledRowsCount++;
      }
    }
    recoveredUsersCount++;
  }

  console.log(`\nPhase 2 Complete: Recovered streaks for ${recoveredUsersCount} users. Backfilled ${backfilledRowsCount} new confirmed check-in rows.`);
  console.log("=== CHECK-IN MIGRATION AND STREAK RECOVERY COMPLETED SUCCESSFULLY ===");
}

main()
  .catch(err => {
    console.error("Migration failed with error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
