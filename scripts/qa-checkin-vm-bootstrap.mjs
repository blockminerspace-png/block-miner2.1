#!/usr/bin/env node
/**
 * Optional QA user setup for check-in tests (container/VM).
 * Production: does NOT create users unless QA_ALLOW_PRODUCTION_USER_CREATE=YES
 * and QA_SINGLE_USER_ONLY=YES; creates at most ONE account per run.
 * Prefer BLOCKMINER_QA_USER_ID or BLOCKMINER_QA_IDENTIFIER for existing account.
 */
import { createHash } from "node:crypto";
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
import { isProductionQaBaseUrl } from "./qa-test-user-patterns.mjs";

const PASS = String(process.env.BLOCKMINER_QA_PASSWORD || "").trim();
const TAG = String(process.env.BLOCKMINER_QA_TAG || Date.now()).slice(0, 12);
const QA_USER_ID = process.env.BLOCKMINER_QA_USER_ID
  ? Number(process.env.BLOCKMINER_QA_USER_ID)
  : null;
const SEED_DAYS = Number(process.env.BLOCKMINER_QA_SEED_DAYS || "0");

if (!PASS || process.env.BLOCKMINER_QA_ALLOW_MUTATION !== "1") {
  console.log(
    JSON.stringify({ ok: false, error: "BLOCKMINER_QA_PASSWORD and BLOCKMINER_QA_ALLOW_MUTATION=1 required" }),
  );
  process.exit(1);
}

async function seedDaysForUser(userId, seedDaysBeforeToday) {
  const today = getCheckinPeriodKey();
  const seeded = [];
  if (seedDaysBeforeToday <= 0) return { today, seeded };
  for (let d = seedDaysBeforeToday; d >= 1; d--) {
    const dateKey = addDaysToBrazilDateKey(today, -d);
    const txHash = balanceCheckinSyntheticTxHash(userId, dateKey);
    await prisma.dailyCheckin.upsert({
      where: { userId_checkinDate: { userId, checkinDate: dateKey } },
      create: {
        userId,
        checkinDate: dateKey,
        txHash,
        status: "confirmed",
        confirmedAt: new Date(),
        amount: 0.03,
        chainId: 0,
        paymentMethod: "balance",
        streak: d,
        usedGrace: false,
        usedFreeze: false,
      },
      update: { status: "confirmed", paymentMethod: "balance", streak: d },
    });
    seeded.push(dateKey);
  }
  return { today, seeded };
}

async function loadOrCreateSingleUser() {
  if (QA_USER_ID && Number.isFinite(QA_USER_ID)) {
    const user = await prisma.user.findUnique({
      where: { id: QA_USER_ID },
      select: { id: true, username: true, walletAddress: true, polBalance: true, email: true },
    });
    if (!user) throw new Error("BLOCKMINER_QA_USER_ID not found");
    return { user, created: false };
  }

  if (isProductionQaBaseUrl()) {
    assertQaProductionUserCreateAllowed("qa-checkin-vm-bootstrap");
    assertQaSingleUserOnly("qa-checkin-vm-bootstrap");
  }

  const suffix = String(process.env.BLOCKMINER_QA_USER_SUFFIX || "offchain").trim();
  const username = `qa_chk_${suffix}_${TAG}`;
  const email = `qa_chk_${suffix}_${TAG}@qa.blockminer.invalid`;
  assertQaUserPrefixAllowed({ username, email });

  const passwordHash = await hashPassword(PASS, 10);
  const walletSuffix = suffix === "onchain" ? createHash("sha256").update(`qa-onchain-${TAG}`).digest("hex").slice(0, 40) : null;
  const walletAddress = walletSuffix ? `0x${walletSuffix}` : null;

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      name: `QA Checkin ${suffix}`,
      username,
      email,
      passwordHash,
      polBalance: "1.00000000",
      walletAddress,
    },
    update: { passwordHash, polBalance: "1.00000000", isBanned: false, walletAddress },
    select: { id: true, username: true, walletAddress: true, polBalance: true, email: true },
  });
  return { user, created: true, suffix };
}

async function main() {
  const { user, created, suffix } = await loadOrCreateSingleUser();
  const seed = await seedDaysForUser(user.id, SEED_DAYS);
  const todayRow = await prisma.dailyCheckin.findUnique({
    where: { userId_checkinDate: { userId: user.id, checkinDate: seed.today } },
    select: { status: true },
  });

  console.log(
    JSON.stringify({
      ok: true,
      tag: TAG,
      periodKeyToday: seed.today,
      created,
      suffix: suffix || null,
      user: {
        userId: user.id,
        username: user.username,
        hasWallet: Boolean(user.walletAddress),
        polBalance: Number(user.polBalance),
        seedDays: SEED_DAYS,
        seededDates: seed.seeded,
        todayAlreadyCheckedIn: todayRow?.status === "confirmed",
      },
      note: isProductionQaBaseUrl()
        ? "Production: use BLOCKMINER_QA_USER_ID to reuse one QA account; avoid repeated bootstrap runs."
        : "Local/test bootstrap",
    }),
  );
}

main()
  .catch((e) => {
    console.log(JSON.stringify({ ok: false, error: e?.message || String(e) }));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
