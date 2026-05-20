#!/usr/bin/env node
/**
 * Seeds grace-gap check-in history on an existing QA user (no new user in production).
 */
import prisma from "../dist/server/src/db/prisma.js";
import { hashPassword } from "../dist/server/modules/auth/shared/auth.service.js";
import { balanceCheckinSyntheticTxHash } from "../dist/server/modules/checkin/checkin.controller.js";
import { getCheckinPeriodKey } from "../dist/server/utils/checkinPeriod.js";
import { addDaysToBrazilDateKey } from "../dist/server/utils/checkinDate.js";
import {
  assertQaProductionUserCreateAllowed,
  assertQaSingleUserOnly,
  assertQaUserPrefixAllowed,
} from "./qa-production-guard.mjs";
import { isProductionQaBaseUrl, isQaTestUserRecord } from "./qa-test-user-patterns.mjs";

const PASS = String(process.env.BLOCKMINER_QA_PASSWORD || "").trim();
const TAG = String(process.env.BLOCKMINER_QA_TAG || "").trim();
const QA_USER_ID = process.env.BLOCKMINER_QA_USER_ID ? Number(process.env.BLOCKMINER_QA_USER_ID) : null;

if (!PASS || process.env.BLOCKMINER_QA_ALLOW_MUTATION !== "1") {
  console.log(JSON.stringify({ ok: false, error: "missing env" }));
  process.exit(1);
}

async function resolveUser() {
  if (QA_USER_ID && Number.isFinite(QA_USER_ID)) {
    const u = await prisma.user.findUnique({
      where: { id: QA_USER_ID },
      select: { id: true, username: true, email: true },
    });
    if (!u || !isQaTestUserRecord(u)) throw new Error("BLOCKMINER_QA_USER_ID must be a QA test account");
    return u;
  }
  if (isProductionQaBaseUrl()) {
    throw new Error("Em produção use BLOCKMINER_QA_USER_ID — não cria usuário grace automaticamente");
  }
  assertQaProductionUserCreateAllowed("qa-checkin-grace-seed");
  assertQaSingleUserOnly("qa-checkin-grace-seed");
  const username = `qa_chk_grace_${TAG}`;
  const email = `qa_chk_grace_${TAG}@qa.blockminer.invalid`;
  assertQaUserPrefixAllowed({ username, email });
  const passwordHash = await hashPassword(PASS, 10);
  return prisma.user.upsert({
    where: { email },
    create: { name: "QA Grace", username, email, passwordHash, polBalance: "1" },
    update: { passwordHash, polBalance: "1", isBanned: false },
    select: { id: true, username: true, email: true },
  });
}

const u = await resolveUser();
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
