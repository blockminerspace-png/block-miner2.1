import prisma from '../src/db/prisma.js';

/** Fraction of each referred user's block reward (POL + SHIB) paid to their referrer. */
export const REFERRAL_MINING_COMMISSION_RATE = 0.10;

export async function createReferral(referrerId, referredId) {
  return prisma.referral.create({
    data: {
      referrerId,
      referredId,
      createdAt: new Date()
    }
  });
}

export async function getReferrer(userId) {
  return prisma.referral.findFirst({
    where: { referredId: userId },
    include: { referrer: true }
  });
}

export async function listReferredUsers(userId) {
  return prisma.referral.findMany({
    where: { referrerId: userId },
    include: { referred: true }
  });
}

export async function getUserByRefCode(refCode) {
  if (!refCode) return null;
  return prisma.user.findUnique({
    where: { refCode: refCode }
  });
}
