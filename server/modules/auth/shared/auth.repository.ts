import crypto from "crypto";
import prisma from "../../../src/db/prisma.js";

const WELCOME_MINER_SLUG = "welcome-10ghs";
const WELCOME_MINER_NAME = "Welcome Miner";
const WELCOME_MINER_HASH_RATE = 10;
const WELCOME_MINER_SLOT_SIZE = 1;
const WELCOME_MINER_IMAGE_URL = "/machines/reward1.png";

export function normalizeIdentifier(value: unknown): string {
  return String(value || "").trim();
}

export function normalizeEmail(value: unknown): string {
  return normalizeIdentifier(value).toLowerCase();
}

/** Referral link may use ?ref=<userId> (digits) or legacy ?ref=<refCode>. */
export async function resolveReferrerFromRefInput(refCodeInput: unknown) {
  const raw = String(refCodeInput ?? "").trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const id = parseInt(raw, 10);
    if (id > 0) {
      const byId = await prisma.user.findUnique({ where: { id } });
      if (byId) return byId;
    }
  }
  return prisma.user.findUnique({ where: { refCode: raw } });
}

export async function generateUniqueRefCode(): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = crypto.randomBytes(5).toString("hex");
    const exists = await prisma.user.findUnique({ where: { refCode: code } });
    if (!exists) return code;
  }
  throw new Error("Unable to generate referral code");
}

export async function ensureWelcomeMiner() {
  let miner = await prisma.miner.findUnique({ where: { slug: WELCOME_MINER_SLUG } });
  if (!miner) {
    miner = await prisma.miner.create({
      data: {
        name: WELCOME_MINER_NAME,
        slug: WELCOME_MINER_SLUG,
        baseHashRate: WELCOME_MINER_HASH_RATE,
        price: 0,
        slotSize: WELCOME_MINER_SLOT_SIZE,
        imageUrl: WELCOME_MINER_IMAGE_URL,
        isActive: true,
        showInShop: false,
      },
    });
  }
  return miner;
}

export async function findUserByIdentifier(identifier: unknown) {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  const normalizedEmail = normalizeEmail(identifier);

  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: normalizedEmail, mode: "insensitive" } },
        { username: { equals: normalizedIdentifier, mode: "insensitive" } },
        { name: { equals: normalizedIdentifier, mode: "insensitive" } },
      ],
    },
  });

  if (user) return user;

  // Legacy fallback for historically concatenated/corrupted emails.
  if (normalizedIdentifier.includes("@")) {
    user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { endsWith: normalizedEmail, mode: "insensitive" } },
          { email: { contains: normalizedEmail, mode: "insensitive" } },
        ],
      },
      orderBy: { id: "desc" },
    });
  }

  return user;
}
