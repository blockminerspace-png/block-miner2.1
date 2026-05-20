#!/usr/bin/env node
/**
 * Run inside app container on VM only (BLOCKMINER_QA_ALLOW_MUTATION=1).
 * Creates QA users and optional streak seeds. Prints sanitized JSON to stdout.
 * Never prints password.
 */
import { createHash } from "node:crypto";
import prisma from "../dist/server/src/db/prisma.js";
import { hashPassword } from "../dist/server/modules/auth/shared/auth.service.js";
import { balanceCheckinSyntheticTxHash } from "../dist/server/modules/checkin/checkin.controller.js";
import { getCheckinPeriodKey } from "../dist/server/utils/checkinPeriod.js";
import { addDaysToBrazilDateKey } from "../dist/server/utils/checkinDate.js";

const PASS = String(process.env.BLOCKMINER_QA_PASSWORD || "").trim();
const TAG = String(process.env.BLOCKMINER_QA_TAG || Date.now()).slice(0, 12);

if (!PASS || process.env.BLOCKMINER_QA_ALLOW_MUTATION !== "1") {
  console.log(JSON.stringify({ ok: false, error: "BLOCKMINER_QA_PASSWORD and BLOCKMINER_QA_ALLOW_MUTATION=1 required" }));
  process.exit(1);
}

async function ensureUser({ suffix, polBalance, walletAddress = null, seedDaysBeforeToday = 0 }) {
  const username = `qa_chk_${suffix}_${TAG}`;
  const email = `qa_chk_${suffix}_${TAG}@qa.blockminer.invalid`;
  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { id: true, username: true, walletAddress: true, polBalance: true },
  });
  const passwordHash = await hashPassword(PASS, 10);
  let user;
  if (existing) {
    user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        polBalance: polBalance,
        walletAddress: walletAddress ?? existing.walletAddress,
        isBanned: false,
      },
      select: { id: true, username: true, walletAddress: true, polBalance: true },
    });
  } else {
    user = await prisma.user.create({
      data: {
        name: `QA Checkin ${suffix}`,
        username,
        email,
        passwordHash,
        polBalance,
        walletAddress,
      },
      select: { id: true, username: true, walletAddress: true, polBalance: true },
    });
  }

  const today = getCheckinPeriodKey();
  const seeded = [];
  if (seedDaysBeforeToday > 0) {
    for (let d = seedDaysBeforeToday; d >= 1; d--) {
      const dateKey = addDaysToBrazilDateKey(today, -d);
      const txHash = balanceCheckinSyntheticTxHash(user.id, dateKey);
      await prisma.dailyCheckin.upsert({
        where: { userId_checkinDate: { userId: user.id, checkinDate: dateKey } },
        create: {
          userId: user.id,
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
        update: {
          status: "confirmed",
          paymentMethod: "balance",
          streak: d,
        },
      });
      seeded.push(dateKey);
    }
  }

  const todayRow = await prisma.dailyCheckin.findUnique({
    where: { userId_checkinDate: { userId: user.id, checkinDate: today } },
    select: { status: true },
  });

  return {
    role: suffix,
    userId: user.id,
    username: user.username,
    hasWallet: Boolean(user.walletAddress),
    polBalance: Number(user.polBalance),
    seedDaysBeforeToday,
    seededDates: seeded,
    todayAlreadyCheckedIn: todayRow?.status === "confirmed",
  };
}

async function main() {
  const out = {
    ok: true,
    tag: TAG,
    periodKeyToday: getCheckinPeriodKey(),
    users: [],
  };

  out.users.push(
    await ensureUser({ suffix: "offchain", polBalance: "1.00000000", seedDaysBeforeToday: 0 }),
  );
  out.users.push(
    await ensureUser({ suffix: "stelar7", polBalance: "1.00000000", seedDaysBeforeToday: 6 }),
  );
  out.users.push(
    await ensureUser({ suffix: "machine14", polBalance: "1.00000000", seedDaysBeforeToday: 13 }),
  );
  const walletNonce = createHash("sha256").update(`qa-onchain-${TAG}`).digest("hex").slice(0, 40);
  const qaWallet = `0x${walletNonce}`;
  out.users.push(
    await ensureUser({
      suffix: "onchain",
      polBalance: "1.00000000",
      walletAddress: qaWallet,
      seedDaysBeforeToday: 0,
    }),
  );
  out.qaWalletPartial = `0x…${walletNonce.slice(-6)}`;

  console.log(JSON.stringify(out));
}

main()
  .catch((e) => {
    console.log(JSON.stringify({ ok: false, error: e?.message || String(e) }));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
