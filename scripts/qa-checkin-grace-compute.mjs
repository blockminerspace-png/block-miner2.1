#!/usr/bin/env node
/** Validates grace streak math with a fixed clock (no production user mutation). */
import prisma from "../dist/server/src/db/prisma.js";
import { computeStreakAfterCheckin } from "../dist/server/utils/checkinStreak.js";
import { getCheckinPeriodKey, isWithinGraceForPeriod } from "../dist/server/utils/checkinPeriod.js";
import { addDaysToBrazilDateKey } from "../dist/server/utils/checkinDate.js";

const TAG = process.env.BLOCKMINER_QA_TAG || "grace-compute";
const PASS = process.env.BLOCKMINER_QA_PASSWORD || "";
if (!PASS) {
  console.log(JSON.stringify({ ok: false, error: "password required" }));
  process.exit(1);
}

const username = `qa_chk_grace_compute_${TAG}`;
const email = `${username}@qa.blockminer.invalid`;
const user = await prisma.user.findFirst({ where: { email }, select: { id: true } });
if (!user) {
  console.log(JSON.stringify({ ok: false, error: "run grace-seed first or create user" }));
  process.exit(1);
}

const now = new Date("2026-05-19T23:30:00.000Z");
const today = getCheckinPeriodKey(now);
const yesterday = addDaysToBrazilDateKey(today, -1);

const result = await computeStreakAfterCheckin(
  { userId: user.id, periodKey: today, now },
  {
    countGraceUsesInMonth: async () => 0,
    countFreezeUsesInMonth: async () => 0,
    maxGracePerMonth: 2,
    maxFreezePerMonth: 1,
    freezeEnabled: true,
  },
);

console.log(
  JSON.stringify({
    ok: true,
    userIdPartial: `…${String(user.id).slice(-3)}`,
    today,
    yesterday,
    isWithinGraceForYesterday: isWithinGraceForPeriod(yesterday, now),
    streakAfter: result.streakAfter,
    usedGrace: result.usedGrace,
    usedFreeze: result.usedFreeze,
    pass: result.usedGrace === true && result.streakAfter >= 3,
  }),
);
await prisma.$disconnect();
