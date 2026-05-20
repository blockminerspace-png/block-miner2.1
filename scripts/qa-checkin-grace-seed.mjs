#!/usr/bin/env node
import prisma from "../dist/server/src/db/prisma.js";
import { hashPassword } from "../dist/server/modules/auth/shared/auth.service.js";
import { balanceCheckinSyntheticTxHash } from "../dist/server/modules/checkin/checkin.controller.js";
import { getCheckinPeriodKey } from "../dist/server/utils/checkinPeriod.js";
import { addDaysToBrazilDateKey } from "../dist/server/utils/checkinDate.js";

const TAG = String(process.env.BLOCKMINER_QA_TAG || "").trim();
const PASS = String(process.env.BLOCKMINER_QA_PASSWORD || "").trim();
if (!TAG || !PASS || process.env.BLOCKMINER_QA_ALLOW_MUTATION !== "1") {
  console.log(JSON.stringify({ ok: false, error: "missing env" }));
  process.exit(1);
}

const username = `qa_chk_grace_${TAG}`;
const email = `qa_chk_grace_${TAG}@qa.blockminer.invalid`;
const passwordHash = await hashPassword(PASS, 10);
let u = await prisma.user.upsert({
  where: { email },
  create: { name: "QA Grace", username, email, passwordHash, polBalance: "1" },
  update: { passwordHash, polBalance: "1", isBanned: false },
});
const today = getCheckinPeriodKey();
const d3 = addDaysToBrazilDateKey(today, -3);
const d2 = addDaysToBrazilDateKey(today, -2);
const skipped = addDaysToBrazilDateKey(today, -1);
for (const [dateKey, streak] of [
  [d3, 1],
  [d2, 2],
]) {
  const tx = balanceCheckinSyntheticTxHash(u.id, dateKey);
  await prisma.dailyCheckin.upsert({
    where: { userId_checkinDate: { userId: u.id, checkinDate: dateKey } },
    create: {
      userId: u.id,
      checkinDate: dateKey,
      txHash: tx,
      status: "confirmed",
      confirmedAt: new Date(),
      amount: 0.03,
      chainId: 0,
      paymentMethod: "balance",
      streak,
    },
    update: { status: "confirmed", streak },
  });
}
console.log(
  JSON.stringify({
    ok: true,
    userId: u.id,
    username: u.username,
    seeded: [d3, d2],
    skippedPeriod: skipped,
    today,
  }),
);
await prisma.$disconnect();
