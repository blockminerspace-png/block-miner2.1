/**
 * Shared QA test account detection (no secrets).
 */

export const QA_EMAIL_SUFFIX = "@qa.blockminer.invalid";

/** @param {string | null | undefined} username */
export function isQaTestUsername(username) {
  const u = String(username || "").trim().toLowerCase();
  if (!u) return false;
  return u.startsWith("qa_chk_") || u.startsWith("qa-chk") || u.startsWith("qa_");
}

/** @param {string | null | undefined} email */
export function isQaTestEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return e.endsWith(QA_EMAIL_SUFFIX);
}

/** @param {{ username?: string | null, email?: string | null }} user */
export function isQaTestUserRecord(user) {
  return isQaTestUsername(user.username) || isQaTestEmail(user.email);
}

/** Prisma-style where fragment for users table. */
export function prismaQaUserWhere() {
  return {
    OR: [
      { email: { endsWith: QA_EMAIL_SUFFIX, mode: "insensitive" } },
      { username: { startsWith: "qa_chk_", mode: "insensitive" } },
      { username: { startsWith: "qa-chk", mode: "insensitive" } },
      { username: { startsWith: "qa_", mode: "insensitive" } },
    ],
  };
}

export function isProductionQaBaseUrl(baseUrl) {
  const u = String(baseUrl || process.env.BLOCKMINER_QA_BASE_URL || "").toLowerCase();
  return u.includes("blockminer.space");
}
