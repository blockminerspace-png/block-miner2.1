#!/usr/bin/env node
/**
 * Audits check-in streak milestones with disallowed reward types.
 * Default: dry-run. Apply deactivation with CHECKIN_MILESTONE_CLEANUP_CONFIRM=YES
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DISALLOWED = new Set(["item", "stelar", "zer", "none", "ticket"]);
const MIGRATE_HASHRATE = process.argv.includes("--migrate-hashrate");

function isInvalidType(raw) {
  const t = String(raw || "").trim().toLowerCase();
  if (DISALLOWED.has(t)) return true;
  if (t === "hashrate") return false;
  if (["pol", "temporary_power", "machine", "balance"].includes(t)) return false;
  return t !== "pol" && t !== "temporary_power" && t !== "machine";
}

async function main() {
  const apply = process.env.CHECKIN_MILESTONE_CLEANUP_CONFIRM === "YES";
  const rows = await prisma.checkinStreakMilestone.findMany({
    orderBy: [{ sortOrder: "asc" }, { dayThreshold: "asc" }],
  });

  const invalid = rows.filter((r) => isInvalidType(r.rewardType));
  const hashrate = rows.filter((r) => String(r.rewardType).toLowerCase() === "hashrate");

  const grantCounts = await Promise.all(
    invalid.map(async (m) => {
      const count = await prisma.userCheckinStreakReward.count({ where: { milestoneId: m.id } });
      return { id: m.id, dayThreshold: m.dayThreshold, rewardType: m.rewardType, grantCount: count };
    }),
  );

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry_run",
        total: rows.length,
        invalid_count: invalid.length,
        hashrate_legacy_count: hashrate.length,
        invalid: grantCounts,
        migrate_hashrate_flag: MIGRATE_HASHRATE,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("Dry-run only. Set CHECKIN_MILESTONE_CLEANUP_CONFIRM=YES to deactivate invalid milestones.");
    return;
  }

  for (const m of invalid) {
    await prisma.checkinStreakMilestone.update({
      where: { id: m.id },
      data: { active: false, itemCode: null },
    });
  }

  if (MIGRATE_HASHRATE) {
    for (const m of hashrate) {
      const hours = Math.max(1, Number(m.validityDays || 1) * 24);
      await prisma.checkinStreakMilestone.update({
        where: { id: m.id },
        data: {
          rewardType: "temporary_power",
          metadataJson: { durationHours: hours },
          itemCode: null,
          displayTitle: null,
          description: null,
        },
      });
    }
  }

  console.log(
    JSON.stringify({
      deactivated: invalid.length,
      hashrate_migrated: MIGRATE_HASHRATE ? hashrate.length : 0,
      note: "Existing user grants were not deleted.",
    }),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
