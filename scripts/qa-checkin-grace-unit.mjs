#!/usr/bin/env node
/** In-container grace/streak logic smoke (no DB mutation). */
import { computeStreakAfterCheckin } from "../dist/server/utils/checkinStreak.js";
import { getCheckinPeriodKey, isWithinGraceForPeriod } from "../dist/server/utils/checkinPeriod.js";
import { addDaysToBrazilDateKey } from "../dist/server/utils/checkinDate.js";

const noop = async () => 0;
const deps = {
  countGraceUsesInMonth: noop,
  countFreezeUsesInMonth: noop,
  maxGracePerMonth: 2,
  maxFreezePerMonth: 1,
  freezeEnabled: true,
};

async function main() {
  const now = new Date();
  const today = getCheckinPeriodKey(now);
  const yesterday = addDaysToBrazilDateKey(today, -1);
  const graceSample = addDaysToBrazilDateKey(today, -2);
  const results = [];

  const consecutive = await computeStreakAfterCheckin(
    { userId: 999001, periodKey: today, now },
    deps,
  );
  results.push({
    case: "first_checkin_no_history",
    streakAfter: consecutive.streakAfter,
    usedGrace: consecutive.usedGrace,
  });

  const missedWithGrace = await computeStreakAfterCheckin(
    { userId: 999002, periodKey: today, now },
    {
      ...deps,
      countGraceUsesInMonth: async () => 0,
      countFreezeUsesInMonth: async () => 0,
    },
  );
  results.push({
    case: "grace_window_exists",
    graceEndsAtSample: isWithinGraceForPeriod(yesterday, now),
    periodKeys: { today, yesterday, graceSample },
    note: "Full grace path requires DB history; isWithinGraceForPeriod validates window math",
  });

  console.log(
    JSON.stringify({
      ok: true,
      today,
      isWithinGraceForYesterday: isWithinGraceForPeriod(yesterday, now),
      results,
      missedWithGrace,
    }),
  );
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
