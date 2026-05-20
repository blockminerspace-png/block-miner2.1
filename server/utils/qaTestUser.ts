import type { Prisma } from "@prisma/client";

const QA_EMAIL_SUFFIX = "@qa.blockminer.invalid";

export function isQaTestUsername(username: string | null | undefined): boolean {
  const u = String(username ?? "").trim().toLowerCase();
  if (!u) return false;
  return u.startsWith("qa_chk_") || u.startsWith("qa-chk") || u.startsWith("qa_");
}

export function isQaTestEmail(email: string | null | undefined): boolean {
  const e = String(email ?? "").trim().toLowerCase();
  return e.endsWith(QA_EMAIL_SUFFIX);
}

export function isQaTestUserRecord(user: {
  username?: string | null;
  email?: string | null;
}): boolean {
  return isQaTestUsername(user.username) || isQaTestEmail(user.email);
}

/** Prisma filter: accounts created for automated QA (check-in scripts, etc.). */
export function qaTestUserWhere(): Prisma.UserWhereInput {
  return {
    OR: [
      { email: { endsWith: QA_EMAIL_SUFFIX, mode: "insensitive" } },
      { username: { startsWith: "qa_chk_", mode: "insensitive" } },
      { username: { startsWith: "qa-chk", mode: "insensitive" } },
      { username: { startsWith: "qa_", mode: "insensitive" } },
    ],
  };
}

export function excludeQaTestUsersWhere(): Prisma.UserWhereInput {
  return { NOT: qaTestUserWhere() };
}
